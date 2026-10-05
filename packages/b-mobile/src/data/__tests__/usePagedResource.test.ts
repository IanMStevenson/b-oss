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
    const fetchPage = vi.fn((pageIndex: number) =>
      Promise.resolve(page(pageIndex * PAGE_SIZE, PAGE_SIZE, true)),
    );
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
    const fetchPage = vi.fn((pageIndex: number) =>
      Promise.resolve(page(pageIndex * PAGE_SIZE, PAGE_SIZE, true)),
    );
    const { result } = renderHook(() => usePagedResource(fetchPage, [], PAGE_SIZE));
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    act(() => result.current.seekTo(5)); // within page 0
    await waitFor(() => expect(result.current.seeking).toBe(false));

    expect(result.current.windowStart).toBe(0);
    expect(result.current.hasBefore).toBe(false);
  });

  it('loadMore after a seek continues forward from the new anchor, not from page 0', async () => {
    const fetchPage = vi.fn((pageIndex: number) =>
      Promise.resolve(page(pageIndex * PAGE_SIZE, PAGE_SIZE, true)),
    );
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
    const fetchPage = vi.fn((pageIndex: number) =>
      Promise.resolve(page(pageIndex * PAGE_SIZE, PAGE_SIZE, true)),
    );
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
    const fetchPage = vi.fn((pageIndex: number) =>
      Promise.resolve(page(pageIndex * PAGE_SIZE, PAGE_SIZE, true)),
    );
    const { result } = renderHook(() => usePagedResource(fetchPage, [], PAGE_SIZE));
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    expect(result.current.hasBefore).toBe(false);

    act(() => result.current.loadBefore());

    expect(fetchPage).toHaveBeenCalledTimes(1); // only the initial refresh() call — no extra fetch
  });
});

describe('usePagedResource — device-test follow-ups (b-oss#153)', () => {
  const pagesOf = (pageIndex: number) =>
    Promise.resolve(page(pageIndex * PAGE_SIZE, PAGE_SIZE, true));

  it('loadBefore with a target further back than one page seeks there instead of prepending', async () => {
    // Regression: a window re-anchored far from the start, then paged back to page 1, called
    // loadBefore() — which fetches only the one page before the window and so could never reach
    // the start. The grid sat on "Loading…" until the user tapped another page and back.
    const fetchPage = vi.fn(pagesOf);
    const { result } = renderHook(() => usePagedResource(fetchPage, [], PAGE_SIZE));
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    act(() => result.current.seekTo(300 * PAGE_SIZE)); // far away
    await waitFor(() => expect(result.current.seeking).toBe(false));
    fetchPage.mockClear();

    act(() => result.current.loadBefore(0));
    await waitFor(() => expect(result.current.seeking).toBe(false));

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(0);
    expect(result.current.windowStart).toBe(0);
    expect(result.current.hasBefore).toBe(false);
  });

  it('loadBefore with a target inside the immediately-previous page still just prepends', async () => {
    const fetchPage = vi.fn(pagesOf);
    const { result } = renderHook(() => usePagedResource(fetchPage, [], PAGE_SIZE));
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    act(() => result.current.seekTo(10 * PAGE_SIZE));
    await waitFor(() => expect(result.current.seeking).toBe(false));

    act(() => result.current.loadBefore(10 * PAGE_SIZE - 5));
    await waitFor(() => expect(result.current.loadingBefore).toBe(false));

    expect(result.current.windowStart).toBe(9 * PAGE_SIZE);
    expect(result.current.items).toHaveLength(PAGE_SIZE * 2);
  });

  it('a second seekTo while one is in flight wins instead of being dropped', async () => {
    let resolveFirst: (p: Page<number>) => void = () => {};
    const fetchPage = vi.fn((pageIndex: number) => {
      if (pageIndex === 5) return new Promise<Page<number>>((r) => (resolveFirst = r));
      return pagesOf(pageIndex);
    });
    const { result } = renderHook(() => usePagedResource(fetchPage, [], PAGE_SIZE));
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    act(() => result.current.seekTo(5 * PAGE_SIZE)); // stays pending
    act(() => result.current.seekTo(0)); // user taps page 1 meanwhile
    await waitFor(() => expect(result.current.seeking).toBe(false));
    act(() => resolveFirst(page(5 * PAGE_SIZE, PAGE_SIZE, true))); // stale one lands late
    await new Promise((r) => setTimeout(r, 0));

    expect(fetchPage).toHaveBeenCalledWith(0);
    expect(result.current.windowStart).toBe(0);
    expect(result.current.items[0]).toBe(0);
  });

  it('loadMore is a no-op while a seek is in flight (would append the old window onto the new one)', async () => {
    let resolveSeek: (p: Page<number>) => void = () => {};
    const fetchPage = vi.fn((pageIndex: number) => {
      if (pageIndex === 9) return new Promise<Page<number>>((r) => (resolveSeek = r));
      return pagesOf(pageIndex);
    });
    const { result } = renderHook(() => usePagedResource(fetchPage, [], PAGE_SIZE));
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    fetchPage.mockClear();

    act(() => {
      result.current.seekTo(9 * PAGE_SIZE);
      result.current.loadMore();
    });

    expect(fetchPage).toHaveBeenCalledTimes(1); // the seek only — no loadMore fetch
    expect(fetchPage).toHaveBeenCalledWith(9);
    act(() => resolveSeek(page(9 * PAGE_SIZE, PAGE_SIZE, true)));
  });
});

describe('usePagedResource — server clamps page_index (depth limit)', () => {
  // The real server clamps page_index to a per-endpoint maximum (journal: 200) and returns that
  // last reachable page labelled with its *own* index — observed on-device: asking for 228
  // returned page.index 200.
  const MAX_INDEX = 200;
  const clampingFetch = vi.fn((pageIndex: number): Promise<Page<number>> => {
    const served = Math.min(pageIndex, MAX_INDEX);
    return Promise.resolve({ ...page(served * PAGE_SIZE, PAGE_SIZE, true), index: served });
  });

  it('a seek past the limit anchors on the page actually served and reports no more', async () => {
    clampingFetch.mockClear();
    const { result } = renderHook(() => usePagedResource(clampingFetch, [], PAGE_SIZE));
    await waitFor(() => expect(result.current.status).toBe('loaded'));

    act(() => result.current.seekTo(228 * PAGE_SIZE));
    await waitFor(() => expect(result.current.seeking).toBe(false));

    expect(clampingFetch).toHaveBeenLastCalledWith(228);
    // Anchored at 200, not the requested 228 — so the data isn't mislabelled as page 228.
    expect(result.current.windowStart).toBe(MAX_INDEX * PAGE_SIZE);
    expect(result.current.items[0]).toBe(MAX_INDEX * PAGE_SIZE);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.hasBefore).toBe(true);
  });

  it('loadMore walking into the limit stops instead of appending a repeat of the last page', async () => {
    const { result } = renderHook(() => usePagedResource(clampingFetch, [], PAGE_SIZE));
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    act(() => result.current.seekTo(MAX_INDEX * PAGE_SIZE)); // exactly the last reachable page
    await waitFor(() => expect(result.current.seeking).toBe(false));
    expect(result.current.hasMore).toBe(true); // not clamped: it IS page 200, server says more
    const before = result.current.items.length;

    act(() => result.current.loadMore()); // asks for 201 → server repeats 200
    await waitFor(() => expect(result.current.loadingMore).toBe(false));

    expect(result.current.items).toHaveLength(before); // nothing duplicated
    expect(result.current.hasMore).toBe(false);
  });

  it('pages without served-index info (or a matching one) behave exactly as before', async () => {
    const plain = vi.fn((i: number) => Promise.resolve(page(i * PAGE_SIZE, PAGE_SIZE, true)));
    const { result } = renderHook(() => usePagedResource(plain, [], PAGE_SIZE));
    await waitFor(() => expect(result.current.status).toBe('loaded'));
    act(() => result.current.seekTo(10 * PAGE_SIZE));
    await waitFor(() => expect(result.current.seeking).toBe(false));
    expect(result.current.windowStart).toBe(10 * PAGE_SIZE);
    expect(result.current.hasMore).toBe(true);
  });
});

describe('usePagedResource — resuming (b-oss#182)', () => {
  const pagesOf = (pageIndex: number) =>
    Promise.resolve(page(pageIndex * PAGE_SIZE, PAGE_SIZE, true));

  it('shows a remembered feed straight away on a rebuilt screen, without fetching it again', async () => {
    const first = vi.fn(pagesOf);
    const mount1 = renderHook(() => usePagedResource(first, [], PAGE_SIZE, 'feed:a'));
    await waitFor(() => expect(mount1.result.current.status).toBe('loaded'));
    mount1.unmount(); // the screen goes away (opening an entry)

    const second = vi.fn(pagesOf);
    const mount2 = renderHook(() => usePagedResource(second, [], PAGE_SIZE, 'feed:a'));
    expect(mount2.result.current.status).toBe('loaded'); // immediately — no spinner
    expect(mount2.result.current.items).toHaveLength(PAGE_SIZE);
    await new Promise((r) => setTimeout(r, 0));
    expect(second).not.toHaveBeenCalled();
  });

  it('remembers more than the first page: loaded-more items and where loadMore continues from', async () => {
    const mount1 = renderHook(() => usePagedResource(pagesOf, [], PAGE_SIZE, 'feed:b'));
    await waitFor(() => expect(mount1.result.current.status).toBe('loaded'));
    act(() => mount1.result.current.loadMore());
    await waitFor(() => expect(mount1.result.current.items).toHaveLength(2 * PAGE_SIZE));
    mount1.unmount();

    const fetchNext = vi.fn(pagesOf);
    const mount2 = renderHook(() => usePagedResource(fetchNext, [], PAGE_SIZE, 'feed:b'));
    expect(mount2.result.current.items).toHaveLength(2 * PAGE_SIZE);
    act(() => mount2.result.current.loadMore());
    await waitFor(() => expect(mount2.result.current.items).toHaveLength(3 * PAGE_SIZE));
    expect(fetchNext).toHaveBeenCalledTimes(1);
    expect(fetchNext).toHaveBeenCalledWith(2); // continued from page 2, not restarted at 1
  });

  it('remembers a seeked window and its anchor, so paging back still works', async () => {
    const mount1 = renderHook(() => usePagedResource(pagesOf, [], PAGE_SIZE, 'feed:c'));
    await waitFor(() => expect(mount1.result.current.status).toBe('loaded'));
    act(() => mount1.result.current.seekTo(300));
    await waitFor(() => expect(mount1.result.current.seeking).toBe(false));
    mount1.unmount();

    const fetchPrev = vi.fn(pagesOf);
    const mount2 = renderHook(() => usePagedResource(fetchPrev, [], PAGE_SIZE, 'feed:c'));
    expect(mount2.result.current.windowStart).toBe(10 * PAGE_SIZE);
    expect(mount2.result.current.hasBefore).toBe(true);
    act(() => mount2.result.current.loadBefore());
    await waitFor(() => expect(mount2.result.current.loadingBefore).toBe(false));
    expect(fetchPrev).toHaveBeenCalledWith(9);
  });

  it('refetches once the remembered copy has expired', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
    const mount1 = renderHook(() => usePagedResource(pagesOf, [], PAGE_SIZE, 'feed:d'));
    await waitFor(() => expect(mount1.result.current.status).toBe('loaded'));
    mount1.unmount();

    vi.setSystemTime(new Date('2026-10-05T12:30:00Z'));
    const fetchAgain = vi.fn(pagesOf);
    const mount2 = renderHook(() => usePagedResource(fetchAgain, [], PAGE_SIZE, 'feed:d'));
    expect(mount2.result.current.status).toBe('loading');
    await waitFor(() => expect(mount2.result.current.status).toBe('loaded'));
    expect(fetchAgain).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('does not share between keys, and a resumed feed still refetches when its deps change', async () => {
    const mount1 = renderHook(() => usePagedResource(pagesOf, [], PAGE_SIZE, 'feed:e'));
    await waitFor(() => expect(mount1.result.current.status).toBe('loaded'));
    mount1.unmount();

    const other = renderHook(() => usePagedResource(pagesOf, [], PAGE_SIZE, 'feed:other'));
    expect(other.result.current.status).toBe('loading'); // a different key knows nothing

    let dep = 1;
    const fetchDep = vi.fn(pagesOf);
    const resumed = renderHook(() => usePagedResource(fetchDep, [dep], PAGE_SIZE, 'feed:e'));
    expect(resumed.result.current.status).toBe('loaded');
    expect(fetchDep).not.toHaveBeenCalled();
    dep = 2;
    resumed.rerender();
    await waitFor(() => expect(fetchDep).toHaveBeenCalledTimes(1)); // the dep change refetches
  });

  it('without a key it never resumes (the default, as before)', async () => {
    const mount1 = renderHook(() => usePagedResource(pagesOf, [], PAGE_SIZE));
    await waitFor(() => expect(mount1.result.current.status).toBe('loaded'));
    mount1.unmount();
    const mount2 = renderHook(() => usePagedResource(pagesOf, [], PAGE_SIZE));
    expect(mount2.result.current.status).toBe('loading');
  });
});
