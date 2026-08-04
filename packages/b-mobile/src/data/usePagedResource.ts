// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Adds loadMore()/refresh() over useResource's four states, for pull-to-refresh + infinite
// scroll (rules.md, Lists, feeds & paging) — real pagination, no fixed page cap. Tracks the
// API's page index/"more" pair; a request id supersedes stale in-flight pages the same way
// useResource does.

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
}

export function usePagedResource<T>(
  fetchPage: (pageIndex: number) => Promise<Page<T>>,
  deps: unknown[],
): PagedResourceState<T> {
  const [status, setStatus] = useState<PagedStatus>('loading');
  const [items, setItems] = useState<T[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const requestIdRef = useRef(0);
  const pageIndexRef = useRef(0);
  const fetchPageRef = useRef(fetchPage);
  fetchPageRef.current = fetchPage;

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  function refresh(): void {
    const id = ++requestIdRef.current;
    pageIndexRef.current = 0;
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

  return { status, items, errorMessage, hasMore, loadingMore, loadMore, refresh };
}
