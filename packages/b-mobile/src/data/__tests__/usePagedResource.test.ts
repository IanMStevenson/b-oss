// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// seekTo()/loadBefore() (b-oss#153) are the one part of this hook with real invariants worth
// testing directly rather than only through a screen: re-anchoring the loaded window, keeping
// pageIndexRef in sync so loadMore() continues forward from the new anchor, and the same stale-
// request-supersession discipline loadMore()/refresh() already have.

import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { usePagedResource } from '../usePagedResource.js';
import type { Page } from '../usePagedResource.js';

const PAGE_SIZE = 30;

function page(startId: number, count: number, more: boolean): Page<number> {
  return { items: Array.from({ length: count }, (_, i) => startId + i), more };
}

describe('usePagedResource — seekTo (b-oss#153)', () => {
  it('re-anchors the window to the page containing the target offset, in one call', async () => {
    const fetchPage = vi.fn((pageIndex: number) =>
      Promise.resolve(
        pageIndex === 19 ? page(19 * PAGE_SIZE, PAGE_SIZE, true) : page(0, PAGE_SIZE, true),
      ),
    );
    const { result } = renderHook(() => usePagedResource(fetchPage, [], PAGE_SIZE));
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    fetchPage.mockClear();

    act(() => result.current.seekTo(572)); // page containing offset 572 is API pageIndex 19
    await waitFor(() => expect(result.current.seeking).toBe(false));

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(19);
    expect(result.current.windowStart).toBe(19 * PAGE_SIZE);
    expect(result.current.items).toEqual(page(19 * PAGE_SIZE, PAGE_SIZE, true).items);
    expect(result.current.hasBefore).toBe(true);
  });

  it('discards the previous window rather than trying to backfill the gap', async () => {
    const fetchPage = vi.fn((pageIndex: number) => Promise.resolve(page(pageIndex * PAGE_SIZE, PAGE_SIZE, true)));
    const { result } = renderHook(() => usePagedResource(fetchPage, [], PAGE_SIZE));
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(result.current.items).toHaveLength(PAGE_SIZE);

    act(() => result.current.seekTo(300));
    await waitFor(() => expect(result.current.seeking).toBe(false));

    // Still just the one fetched page's worth — the original page 0 wasn't merged in.
    expect(result.current.items).toHaveLength(PAGE_SIZE);
    expect(result.current.windowStart).toBe(10 * PAGE_SIZE);
  });

  it('hasBefore is false when the seek lands on the very first page', async () => {
    const fetchPage = vi.fn((pageIndex: number) => Promise.resolve(page(pageIndex * PAGE_SIZE, PAGE_SIZE, true)));
    const { result } = renderHook(() => usePagedResource(fetchPage, [], PAGE_SIZE));
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    act(() => result.current.seekTo(5)); // within page 0
    await waitFor(() => expect(result.current.seeking).toBe(false));

    expect(result.current.windowStart).toBe(0);
    expect(result.current.hasBefore).toBe(false);
  });

  it('loadMore after a seek continues forward from the new anchor, not from page 0', async () => {
    const fetchPage = vi.fn((pageIndex: number) => Promise.resolve(page(pageIndex * PAGE_SIZE, PAGE_SIZE, true)));
    const { result } = renderHook(() => usePagedResource(fetchPage, [], PAGE_SIZE));
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    act(() => result.current.seekTo(300)); // lands on API page 10
    await waitFor(() => expect(result.current.seeking).toBe(false));
    fetchPage.mockClear();

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.loadingMore).toBe(false));

    expect(fetchPage).toHaveBeenCalledWith(11);
    expect(result.current.items).toHaveLength(PAGE_SIZE * 2);
  });

  it('a stale seek resolving after refresh() does not clobber the fresh state', async () => {
    let resolveSlow: (p: Page<number>) => void = () => {};
    const fetchPage = vi.fn((pageIndex: number) => {
      if (pageIndex === 19) return new Promise<Page<number>>((resolve) => (resolveSlow = resolve));
      return Promise.resolve(page(0, PAGE_SIZE, false));
    });
    const { result } = renderHook(() => usePagedResource(fetchPage, [], PAGE_SIZE));
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    act(() => result.current.seekTo(572)); // hangs on API page 19
    expect(result.current.seeking).toBe(true);

    act(() => result.current.refresh()); // supersedes the in-flight seek
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    const windowStartAfterRefresh = result.current.windowStart;

    act(() => resolveSlow(page(19 * PAGE_SIZE, PAGE_SIZE, true))); // the stale seek finally lands
    await new Promise((r) => setTimeout(r, 0));

    expect(result.current.windowStart).toBe(windowStartAfterRefresh);
    expect(result.current.windowStart).toBe(0);
  });
});

describe('usePagedResource — loadBefore (b-oss#153)', () => {
  it('fetches the one page immediately before the current window and prepends it', async () => {
    const fetchPage = vi.fn((pageIndex: number) => Promise.resolve(page(pageIndex * PAGE_SIZE, PAGE_SIZE, true)));
    const { result } = renderHook(() => usePagedResource(fetchPage, [], PAGE_SIZE));
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    act(() => result.current.seekTo(300)); // API page 10
    await waitFor(() => expect(result.current.seeking).toBe(false));
    fetchPage.mockClear();

    act(() => result.current.loadBefore());
    await waitFor(() => expect(result.current.loadingBefore).toBe(false));

    expect(fetchPage).toHaveBeenCalledWith(9);
    expect(result.current.windowStart).toBe(9 * PAGE_SIZE);
    expect(result.current.items).toHaveLength(PAGE_SIZE * 2);
    expect(result.current.items[0]).toBe(9 * PAGE_SIZE);
  });

  it('is a no-op once the window reaches the start of the feed', async () => {
    const fetchPage = vi.fn((pageIndex: number) => Promise.resolve(page(pageIndex * PAGE_SIZE, PAGE_SIZE, true)));
    const { result } = renderHook(() => usePagedResource(fetchPage, [], PAGE_SIZE));
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(result.current.hasBefore).toBe(false);

    act(() => result.current.loadBefore());

    expect(fetchPage).toHaveBeenCalledTimes(1); // only the initial refresh() call — no extra fetch
  });
});
