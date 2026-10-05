// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ScrollDetail } from '@ionic/core';
import { useScrollResume } from '../useScrollResume.js';
import { resumeGet, resumeSet } from '../resumeCache.js';

const scrollEvent = (scrollTop: number) =>
  new CustomEvent('ionScroll', { detail: { scrollTop } as ScrollDetail });

/** A stand-in for the IonContent element, which exposes scrollToPoint(). */
function fakeContent() {
  return {
    scrollToPoint: vi.fn().mockResolvedValue(undefined),
  } as unknown as HTMLIonContentElement;
}

describe('useScrollResume', () => {
  it('scrolls back to the remembered position once the content is ready', async () => {
    resumeSet('entry:1:scroll', 640);
    const content = fakeContent();
    const { result, rerender } = renderHook(({ ready }) => useScrollResume('entry:1', ready), {
      initialProps: { ready: false },
    });
    (result.current.ref as { current: HTMLIonContentElement | null }).current = content;

    rerender({ ready: false });
    expect(content.scrollToPoint).not.toHaveBeenCalled(); // not before there's anything to scroll

    rerender({ ready: true });
    await waitFor(() => expect(content.scrollToPoint).toHaveBeenCalledWith(0, 640, 0));
  });

  it('does nothing when there is nothing remembered, or no key', async () => {
    const content = fakeContent();
    const none = renderHook(() => useScrollResume('entry:never-seen', true));
    (none.result.current.ref as { current: HTMLIonContentElement | null }).current = content;
    none.rerender();
    const noKey = renderHook(() => useScrollResume(undefined, true));
    (noKey.result.current.ref as { current: HTMLIonContentElement | null }).current = content;
    noKey.rerender();
    await new Promise((r) => setTimeout(r, 30));
    expect(content.scrollToPoint).not.toHaveBeenCalled();
  });

  it('remembers scrolling, but only after the restore — so the initial scroll-to-top cannot wipe it', () => {
    resumeSet('entry:2:scroll', 500);
    const { result, rerender } = renderHook(({ ready }) => useScrollResume('entry:2', ready), {
      initialProps: { ready: false },
    });

    result.current.onIonScroll(scrollEvent(0)); // fires before the page is ready
    expect(resumeGet('entry:2:scroll')).toBe(500); // untouched

    rerender({ ready: true });
    result.current.onIonScroll(scrollEvent(120));
    expect(resumeGet('entry:2:scroll')).toBe(120);
  });

  it('keys positions separately, and restores only once per mount', async () => {
    resumeSet('a:scroll', 100);
    resumeSet('b:scroll', 900);
    const content = fakeContent();
    const { result, rerender } = renderHook(({ k }) => useScrollResume(k, true), {
      initialProps: { k: 'a' },
    });
    (result.current.ref as { current: HTMLIonContentElement | null }).current = content;
    rerender({ k: 'a' });
    await waitFor(() => expect(content.scrollToPoint).toHaveBeenCalledWith(0, 100, 0));
    rerender({ k: 'b' }); // a different key later does not yank the page again
    await new Promise((r) => setTimeout(r, 30));
    expect(content.scrollToPoint).toHaveBeenCalledTimes(1);
  });

  it('asks IonContent for scroll events (otherwise nothing is ever remembered)', () => {
    const { result } = renderHook(() => useScrollResume('k', true));
    expect(result.current.scrollEvents).toBe(true);
  });
});
