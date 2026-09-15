// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Adds loadMore()/refresh() over useResource's four states, for pull-to-refresh + infinite
// scroll (rules.md, Lists, feeds & paging) — real pagination, no fixed page cap. Tracks the
// API's page index/"more" pair; a request id supersedes stale in-flight pages the same way
// useResource does.
//
// seekTo()/loadBefore() (b-oss#153) exist because loadMore() alone can only ever walk forward
// one API page at a time — fine for organic scroll-driven prefetch, but jumping to a distant page
// (e.g. the real last page of a 572-page journal) would mean hundreds of sequential calls just to
// get there, reopening the #138 rate-limit problem. Blipfoto's own list endpoints are directly
// offset-addressable (`pageIndex` is a real server-side page number, not an opaque cursor), so a
// distant jump can instead be a single direct fetch of the page that contains the target entry —
// `windowStart` tracks where that re-anchored window now begins, since it's no longer always 0.

import { useEffect, useRef, useState } from 'react';

export interface Page<T> {
  items: T[];
  more: boolean;
}

export type PagedStatus = 'loading' | 'loaded' | 'empty' | 'error';

export interface PagedResourceState<T> {
  status: PagedStatus;
  items: T[];
  errorMessage?: string;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  refresh: () => void;
  /** Absolute index of `items[0]` in the full server-side feed — 0 except right after `seekTo()`
   * re-anchors the loaded window somewhere else. */
  windowStart: number;
  /** True when `items[0]` isn't actually the feed's first entry, i.e. paging backward from here
   * needs a real fetch (`loadBefore()`) rather than local windowing. */
  hasBefore: boolean;
  loadingBefore: boolean;
  /** Fetches the single API page immediately before the current window and prepends it. */
  loadBefore: () => void;
  /** True while a `seekTo()` fetch is in flight. */
  seeking: boolean;
  /** Jumps directly to the page containing absolute entry index `targetOffset`, discarding the
   * current window and re-anchoring there in one fetch — see the file-level comment. */
  seekTo: (targetOffset: number) => void;
}

export function usePagedResource<T>(
  fetchPage: (pageIndex: number) => Promise<Page<T>>,
  deps: unknown[],
  /** The API's own fixed page size for `fetchPage` — needed to convert an absolute entry offset
   * into the server pageIndex that contains it. Irrelevant (and safe to leave at the default) for
   * a caller that never uses seekTo()/loadBefore(). */
  pageSize = 30,
): PagedResourceState<T> {
  const [status, setStatus] = useState<PagedStatus>('loading');
  const [items, setItems] = useState<T[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [windowStart, setWindowStart] = useState(0);
  const [hasBefore, setHasBefore] = useState(false);
  const [loadingBefore, setLoadingBefore] = useState(false);
  const [seeking, setSeeking] = useState(false);

  const requestIdRef = useRef(0);
  const pageIndexRef = useRef(0);
  const windowStartRef = useRef(0);
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  function refresh(): void {
    const id = ++requestIdRef.current;
    pageIndexRef.current = 0;
    windowStartRef.current = 0;
    setWindowStart(0);
    setHasBefore(false);
    setStatus('loading');
    setErrorMessage(undefined);
    fetchPageRef.current(0).then(
      (page) => {
        if (id !== requestIdRef.current) return;
        setItems(page.items);
        setHasMore(page.more);
        setStatus(page.items.length === 0 ? 'empty' : 'loaded');
      },
      (err: unknown) => {
        if (id !== requestIdRef.current) return;
        setStatus('error');
        setErrorMessage(err instanceof Error ? err.message : 'Something went wrong.');
      },
    );
  }

  function loadMore(): void {
    if (loadingMore || !hasMore || status !== 'loaded') return;
    const id = requestIdRef.current;
    const nextIndex = pageIndexRef.current + 1;
    setLoadingMore(true);
    fetchPageRef.current(nextIndex).then(
      (page) => {
        if (id !== requestIdRef.current) return;
        pageIndexRef.current = nextIndex;
        setItems((prev) => [...prev, ...page.items]);
        setHasMore(page.more);
        setLoadingMore(false);
      },
      () => {
        if (id !== requestIdRef.current) return;
        // A failed "load more" leaves the already-loaded page(s) showing rather than erroring
        // the whole list — the user can just try scrolling again.
        setLoadingMore(false);
      },
    );
  }

  function loadBefore(): void {
    if (loadingBefore || !hasBefore || status !== 'loaded') return;
    const id = requestIdRef.current;
    const prevIndex = windowStartRef.current / pageSize - 1;
    setLoadingBefore(true);
    fetchPageRef.current(prevIndex).then(
      (page) => {
        if (id !== requestIdRef.current) return;
        windowStartRef.current = prevIndex * pageSize;
        setWindowStart(windowStartRef.current);
        setHasBefore(prevIndex > 0);
        setItems((prev) => [...page.items, ...prev]);
        setLoadingBefore(false);
      },
      () => {
        if (id !== requestIdRef.current) return;
        setLoadingBefore(false);
      },
    );
  }

  function seekTo(targetOffset: number): void {
    if (seeking || status !== 'loaded') return;
    const id = ++requestIdRef.current;
    const targetPageIndex = Math.max(0, Math.floor(targetOffset / pageSize));
    setSeeking(true);
    fetchPageRef.current(targetPageIndex).then(
      (page) => {
        if (id !== requestIdRef.current) return;
        pageIndexRef.current = targetPageIndex;
        windowStartRef.current = targetPageIndex * pageSize;
        setWindowStart(windowStartRef.current);
        setHasBefore(targetPageIndex > 0);
        setItems(page.items);
        setHasMore(page.more);
        setSeeking(false);
      },
      () => {
        if (id !== requestIdRef.current) return;
        setSeeking(false);
      },
    );
  }

  return {
    status,
    items,
    errorMessage,
    hasMore,
    loadingMore,
    loadMore,
    refresh,
    windowStart,
    hasBefore,
    loadingBefore,
    loadBefore,
    seeking,
    seekTo,
  };
}
