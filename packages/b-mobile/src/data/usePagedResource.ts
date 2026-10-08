// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Adds loadMore()/refresh() over useResource's four states, for pull-to-refresh + infinite
// scroll — real pagination, no fixed page cap. Tracks the
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
import { resumeGet, resumeSet } from './resumeCache.js';

export interface Page<T> {
  items: T[];
  more: boolean;
  /** The page index and size the *server* says it returned (`BlipPage.index`/`size`). Optional so
   * non-Blipfoto/test pages needn't supply them, but every real fetcher does, via `pageMeta()`:
   * the server silently clamps `page_index` to a per-endpoint maximum (journal: 200 — requesting
   * 228 returned page 200, so a 6,867-entry journal at size 30 showed April 2010 for every deeper
   * page), and without this we'd label that data with the page we *asked* for. */
  index?: number;
  size?: number;
}

/** Spreads the paging fields every fetcher needs from a b-api `BlipPage`. */
export function pageMeta(page: {
  more: 0 | 1;
  index: number;
  size: number;
}): Pick<Page<never>, 'more' | 'index' | 'size'> {
  return { more: page.more === 1, index: page.index, size: page.size };
}

/** True when the server returned a different page than requested — it clamped the index. */
function wasClamped(page: Page<unknown>, requestedIndex: number): boolean {
  return page.index !== undefined && page.index !== requestedIndex;
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
  /** Fetches the single API page immediately before the current window and prepends it. When a
   * `targetOffset` is given that lies further back than that one page, a prepend could never
   * reach it (the grid would sit on "Loading…" forever), so this re-anchors with a `seekTo` there
   * instead. */
  loadBefore: (targetOffset?: number) => void;
  /** True while a `seekTo()` fetch is in flight. */
  seeking: boolean;
  /** Jumps directly to the page containing absolute entry index `targetOffset`, discarding the
   * current window and re-anchoring there in one fetch — see the file-level comment. */
  seekTo: (targetOffset: number) => void;
}

/** What's remembered about a feed so it can be shown again, unfetched, after its screen was
 * unmounted and rebuilt (see data/resumeCache.ts). */
interface ResumeSnapshot<T> {
  items: T[];
  hasMore: boolean;
  windowStart: number;
  pageIndex: number;
}

export function usePagedResource<T>(
  fetchPage: (pageIndex: number) => Promise<Page<T>>,
  deps: unknown[],
  /** The API's own fixed page size for `fetchPage` — needed to convert an absolute entry offset
   * into the server pageIndex that contains it. Irrelevant (and safe to leave at the default) for
   * a caller that never uses seekTo()/loadBefore(). */
  pageSize = 30,
  /** Opt in to resuming: the loaded window is remembered under this key and, if still fresh when
   * the screen is rebuilt (e.g. Back from an entry), shown straight away with no refetch. Must
   * identify everything the data depends on (feed, account…) — the cache can't tell otherwise. */
  resumeKey?: string,
): PagedResourceState<T> {
  // Read once, on the first render only: later renders must not re-seed state from the cache.
  const [snapshot] = useState(() =>
    resumeKey ? resumeGet<ResumeSnapshot<T>>(resumeKey) : undefined,
  );
  const [status, setStatus] = useState<PagedStatus>(snapshot ? 'loaded' : 'loading');
  const [items, setItems] = useState<T[]>(snapshot?.items ?? []);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(snapshot?.hasMore ?? false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [windowStart, setWindowStart] = useState(snapshot?.windowStart ?? 0);
  const [hasBefore, setHasBefore] = useState((snapshot?.windowStart ?? 0) > 0);
  const [loadingBefore, setLoadingBefore] = useState(false);
  const [seeking, setSeeking] = useState(false);

  const requestIdRef = useRef(0);
  // Mirrors `seeking` for the guards below: they're called from effects in the same commit that
  // kicked the seek off, where the `seeking` state value in their closure can still be stale.
  const seekingRef = useRef(false);
  const pageIndexRef = useRef(snapshot?.pageIndex ?? 0);
  const windowStartRef = useRef(snapshot?.windowStart ?? 0);
  const skipInitialRefresh = useRef(snapshot !== undefined);
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  useEffect(() => {
    // Resumed from a snapshot: it *is* the first load, so don't fetch it again (later dep
    // changes — a different tag, account… — still refetch as usual).
    if (skipInitialRefresh.current) {
      skipInitialRefresh.current = false;
      return;
    }
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (resumeKey && status === 'loaded') {
      resumeSet<ResumeSnapshot<T>>(resumeKey, {
        items,
        hasMore,
        windowStart,
        pageIndex: pageIndexRef.current,
      });
    }
  }, [resumeKey, status, items, hasMore, windowStart]);

  function refresh(): void {
    const id = ++requestIdRef.current;
    seekingRef.current = false;
    setSeeking(false);
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
    // Never while a seek is in flight: this would append a page of the *old* window onto
    // whichever window the seek is about to install.
    if (loadingMore || seekingRef.current || !hasMore || status !== 'loaded') return;
    const id = requestIdRef.current;
    const nextIndex = pageIndexRef.current + 1;
    setLoadingMore(true);
    fetchPageRef.current(nextIndex).then(
      (page) => {
        if (id !== requestIdRef.current) return;
        if (wasClamped(page, nextIndex)) {
          // The server won't go deeper: what came back is a repeat of the last reachable page.
          // Appending it would duplicate entries; instead treat this as the end of the feed.
          setHasMore(false);
          setLoadingMore(false);
          return;
        }
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

  function loadBefore(targetOffset?: number): void {
    if (loadingBefore || seekingRef.current || !hasBefore || status !== 'loaded') return;
    if (targetOffset !== undefined && targetOffset < windowStartRef.current - pageSize) {
      seekTo(targetOffset);
      return;
    }
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

  // Deliberately not guarded on an in-flight seek: a second tap must win (the request id below
  // supersedes the stale one), not be silently dropped — dropping left the grid pointed at a page
  // whose data was never going to arrive ("Loading…" until you tapped elsewhere and back).
  function seekTo(targetOffset: number): void {
    if (status !== 'loaded') return;
    const id = ++requestIdRef.current;
    const targetPageIndex = Math.max(0, Math.floor(targetOffset / pageSize));
    seekingRef.current = true;
    setSeeking(true);
    fetchPageRef.current(targetPageIndex).then(
      (page) => {
        if (id !== requestIdRef.current) return;
        // Anchor on the page the server *actually* returned, not the one asked for. When it
        // clamped (target is past its maximum page index) that's the deepest reachable page, and
        // nothing lies beyond it — so hasMore is false and the host's "all loaded" total becomes
        // the true reachable depth instead of an entry count the feed can't deliver.
        const clamped = wasClamped(page, targetPageIndex);
        const servedIndex = clamped ? (page.index as number) : targetPageIndex;
        pageIndexRef.current = servedIndex;
        windowStartRef.current = servedIndex * pageSize;
        setWindowStart(windowStartRef.current);
        setHasBefore(servedIndex > 0);
        setItems(page.items);
        setHasMore(clamped ? false : page.more);
        seekingRef.current = false;
        setSeeking(false);
      },
      () => {
        if (id !== requestIdRef.current) return;
        seekingRef.current = false;
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
