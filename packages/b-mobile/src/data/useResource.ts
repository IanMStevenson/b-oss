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

export function useResource<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
  isEmpty?: (data: T) => boolean,
): ResourceState<T> {
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

  return state;
}
