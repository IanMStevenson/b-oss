// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// b-oss#668: keys scroll the visible page's content; Left/Right and form fields are left alone.

import { afterEach, describe, expect, it } from 'vitest';
import { handleBackKey, handleScrollKey, scrollTarget, visibleContent } from '../keyboardScroll.js';

describe('scrollTarget', () => {
  // A 500px viewport over 2000px of content.
  const at = (key: string, top = 100) => scrollTarget(key, top, 500, 2000);
  it('moves a line for the arrows and a page for PageUp/PageDown', () => {
    expect(at('ArrowDown')).toBe(148);
    expect(at('ArrowUp')).toBe(52);
    expect(at('PageDown')).toBe(100 + 438);
    expect(at('PageUp')).toBe(0);
  });
  it('goes to the ends for Home/End and never past them', () => {
    expect(at('Home')).toBe(0);
    expect(at('End')).toBe(1500);
    expect(at('ArrowDown', 1490)).toBe(1500);
    expect(at('ArrowUp', 10)).toBe(0);
  });
  it('ignores every other key, Left/Right included', () => {
    expect(at('ArrowLeft')).toBeNull();
    expect(at('ArrowRight')).toBeNull();
    expect(at('a')).toBeNull();
  });
});

function page(hidden: boolean, scroll: { top: number; client: number; height: number }) {
  const pg = document.createElement('div');
  pg.className = hidden ? 'ion-page ion-page-hidden' : 'ion-page';
  const content = document.createElement('ion-content');
  const inner = document.createElement('div');
  Object.defineProperty(inner, 'clientHeight', { value: scroll.client });
  Object.defineProperty(inner, 'scrollHeight', { value: scroll.height });
  inner.scrollTop = scroll.top;
  (content as unknown as { getScrollElement: () => Promise<HTMLElement> }).getScrollElement = () =>
    Promise.resolve(inner);
  pg.appendChild(content);
  document.body.appendChild(pg);
  return inner;
}

const press = (key: string, target: EventTarget = document.body, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  Object.defineProperty(e, 'composedPath', { value: () => [target] });
  handleScrollKey(e);
  return e;
};
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.innerHTML = '';
});

describe('handleScrollKey', () => {
  it('scrolls the visible page, not a hidden one', async () => {
    const hidden = page(true, { top: 0, client: 500, height: 2000 });
    const shown = page(false, { top: 0, client: 500, height: 2000 });
    expect(visibleContent()?.parentElement?.className).toBe('ion-page');
    const e = press('PageDown');
    await flush();
    expect(shown.scrollTop).toBe(438);
    expect(hidden.scrollTop).toBe(0);
    expect(e.defaultPrevented).toBe(true);
  });

  it('leaves Left/Right alone (previous/next entry stays with its own handler)', async () => {
    const shown = page(false, { top: 0, client: 500, height: 2000 });
    const e = press('ArrowRight');
    await flush();
    expect(shown.scrollTop).toBe(0);
    expect(e.defaultPrevented).toBe(false);
  });

  it('leaves keys alone inside a text field or with a modifier held', async () => {
    const shown = page(false, { top: 0, client: 500, height: 2000 });
    const input = document.createElement('input');
    document.body.appendChild(input);
    expect(press('ArrowDown', input).defaultPrevented).toBe(false);
    expect(press('End', document.body, { ctrlKey: true }).defaultPrevented).toBe(false);
    await flush();
    expect(shown.scrollTop).toBe(0);
  });
});

describe('handleBackKey (b-oss#874)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });
  const press = (init: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', {
      key: 'Backspace',
      cancelable: true,
      bubbles: true,
      ...init,
    });
    document.body.dispatchEvent(e);
    handleBackKey(e);
    return e;
  };
  function page(extra = '', hidden = false): { clicks: () => number } {
    document.body.innerHTML = `<div class="ion-page${hidden ? ' ion-page-hidden' : ''}"><ion-back-button></ion-back-button><ion-content></ion-content></div>${extra}`;
    const btn = document.querySelector('ion-back-button') as HTMLElement;
    let n = 0;
    btn.addEventListener('click', () => n++);
    // jsdom has no layout; pretend the button is showing.
    btn.getClientRects = () => [{}] as unknown as DOMRectList;
    return { clicks: () => n };
  }

  it('clicks the visible back button', () => {
    const p = page();
    expect(press().defaultPrevented).toBe(true);
    expect(p.clicks()).toBe(1);
  });
  it('does nothing on a hidden page, in a text field, with a modifier, or under an open modal', () => {
    let p = page('', true);
    press();
    expect(p.clicks()).toBe(0);
    p = page('<ion-modal></ion-modal>');
    press();
    expect(p.clicks()).toBe(0);
    p = page();
    press({ ctrlKey: true });
    expect(p.clicks()).toBe(0);
    document.body.insertAdjacentHTML('beforeend', '<input id="i">');
    const input = document.getElementById('i') as HTMLElement;
    const e = new KeyboardEvent('keydown', { key: 'Backspace', cancelable: true, bubbles: true });
    input.dispatchEvent(e);
    handleBackKey(e);
    expect(p.clicks()).toBe(0);
  });
});
