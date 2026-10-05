// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The four-state fetch primitive every data-loading screen uses (§6, rules.md's
// loading/loaded/empty/error requirement). `empty` is distinguished from `loaded` by the
// fetcher's own result via `isEmpty`, not guessed at the call site. Supersedes rather than
// aborts in-flight requests (§7) — CapacitorHttp can't abort natively, so each call holds a
// monotonically increasing request id and discards any response that's no longer the newest.

import { useEffect, useRef, useState } from 'react';

export type ResourceState<T> =
  | { status: 'loading' }
  | { status: 'loaded'; data: T }
  | { status: 'empty' }
  | { status: 'error'; message: string; retry: () => void };

export interface UseResourceResult<T> {
  state: ResourceState<T>;
  /** Refetch unconditionally, whatever the current state — the error state's own `retry` calls
   * the same function; this is the one a caller reaches for after a mutation succeeds (e.g. SCR-06
   * reloading to show a newly-posted comment, FLW-07) rather than only on failure. */
  reload: () => void;
  /** Refetch *without* leaving the loaded state: whatever is on screen stays put (no spinner, no
   * unmounted page, no lost scroll position) and is swapped for the fresh data when it arrives.
   * For a mutation made in place — posting a comment inline — where `reload`'s flash to a spinner
   * would blink the whole screen. A failed refresh keeps showing the old data; the caller already
   * knows its own mutation succeeded. */
  refresh: () => void;
}

export function useResource<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  isEmpty?: (data: T) => boolean,
): UseResourceResult<T> {
  const [state, setState] = useState<ResourceState<T>>({ status: 'loading' });
  const requestIdRef = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  function load(): void {
    const id = ++requestIdRef.current;
    setState({ status: 'loading' });
    fetcherRef.current().then(
      (data) => {
        if (id !== requestIdRef.current) return;
        setState(isEmpty?.(data) ? { status: 'empty' } : { status: 'loaded', data });
      },
      (err: unknown) => {
        if (id !== requestIdRef.current) return;
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : 'Something went wrong.',
          retry: load,
        });
      },
    );
  }

  function refresh(): void {
    const id = ++requestIdRef.current;
    fetcherRef.current().then(
      (data) => {
        if (id !== requestIdRef.current) return;
        setState(isEmpty?.(data) ? { status: 'empty' } : { status: 'loaded', data });
      },
      () => {
        // Keep what's on screen — see `refresh`'s doc comment.
      },
    );
  }

  return { state, reload: load, refresh };
}
