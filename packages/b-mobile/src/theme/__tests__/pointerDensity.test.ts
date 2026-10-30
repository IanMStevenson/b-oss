// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { initPointerDensity, pointerKind } from '../pointerDensity.js';

/** A controllable matchMedia: `set(true)` is "a mouse is now the primary pointer". */
function fakeMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const query = {
    get matches() {
      return matches;
    },
    addEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => listeners.add(l),
    removeEventListener: (_: string, l: (e: MediaQueryListEvent) => void) => listeners.delete(l),
  };
  const asked: string[] = [];
  vi.stubGlobal('matchMedia', (q: string) => {
    asked.push(q);
    return query;
  });
  return {
    asked,
    listeners,
    set(value: boolean) {
      matches = value;
      listeners.forEach((l) => l({ matches: value } as MediaQueryListEvent));
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.pointer;
});

describe('pointerKind', () => {
  it('fine pointer is fine, anything else is coarse', () => {
    expect(pointerKind(true)).toBe('fine');
    expect(pointerKind(false)).toBe('coarse');
  });
});

describe('initPointerDensity', () => {
  it('asks the (pointer: fine) query and sets data-pointer=fine for a mouse', () => {
    const mq = fakeMatchMedia(true);
    initPointerDensity();
    expect(mq.asked).toEqual(['(pointer: fine)']);
    expect(document.documentElement.dataset.pointer).toBe('fine');
  });

  it('sets coarse for touch (phones and touch tablets: unchanged sizes)', () => {
    fakeMatchMedia(false);
    initPointerDensity();
    expect(document.documentElement.dataset.pointer).toBe('coarse');
  });

  it('follows the device live: attaching then removing a mouse', () => {
    const mq = fakeMatchMedia(false);
    initPointerDensity();
    mq.set(true);
    expect(document.documentElement.dataset.pointer).toBe('fine');
    mq.set(false);
    expect(document.documentElement.dataset.pointer).toBe('coarse');
  });

  it('stops listening when told to', () => {
    const mq = fakeMatchMedia(false);
    const stop = initPointerDensity();
    stop();
    expect(mq.listeners.size).toBe(0);
    mq.set(true);
    expect(document.documentElement.dataset.pointer).toBe('coarse');
  });

  it('stays coarse when there is no matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    initPointerDensity();
    expect(document.documentElement.dataset.pointer).toBe('coarse');
  });
});
