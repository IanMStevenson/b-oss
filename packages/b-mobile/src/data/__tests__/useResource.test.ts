// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useResource } from '../useResource.js';

function deferred<T>() {
  let resolve: (v: T) => void = () => {};
  let reject: (e: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useResource', () => {
  it('loads, and reload() goes back through the loading state', async () => {
    let n = 0;
    const { result } = renderHook(() => useResource(() => Promise.resolve(++n), []));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'loaded', data: 1 }));

    act(() => result.current.reload());
    expect(result.current.state.status).toBe('loading'); // the spinner flash refresh() avoids
    await waitFor(() => expect(result.current.state).toEqual({ status: 'loaded', data: 2 }));
  });

  describe('refresh()', () => {
    it('keeps the loaded data on screen while refetching, then swaps in the new data', async () => {
      const gate = deferred<number>();
      let call = 0;
      const { result } = renderHook(() =>
        useResource(() => (++call === 1 ? Promise.resolve(1) : gate.promise), []),
      );
      await waitFor(() => expect(result.current.state.status).toBe('loaded'));

      act(() => result.current.refresh());
      expect(result.current.state).toEqual({ status: 'loaded', data: 1 }); // not 'loading'

      await act(() => {
        gate.resolve(2);
        return Promise.resolve();
      });
      expect(result.current.state).toEqual({ status: 'loaded', data: 2 });
    });

    it('keeps the old data when the refresh fails', async () => {
      let call = 0;
      const { result } = renderHook(() =>
        useResource(
          () => (++call === 1 ? Promise.resolve('old') : Promise.reject(new Error('x'))),
          [],
        ),
      );
      await waitFor(() => expect(result.current.state.status).toBe('loaded'));

      await act(() => {
        result.current.refresh();
        return Promise.resolve();
      });
      expect(result.current.state).toEqual({ status: 'loaded', data: 'old' });
    });

    it('lets only the newest request win', async () => {
      const slow = deferred<string>();
      const fast = deferred<string>();
      let call = 0;
      const { result } = renderHook(() =>
        useResource(() => {
          call++;
          if (call === 1) return Promise.resolve('initial');
          return call === 2 ? slow.promise : fast.promise;
        }, []),
      );
      await waitFor(() => expect(result.current.state.status).toBe('loaded'));

      act(() => result.current.refresh()); // slow
      act(() => result.current.refresh()); // fast supersedes it
      await act(() => {
        fast.resolve('fast');
        return Promise.resolve();
      });
      await act(() => {
        slow.resolve('slow');
        return Promise.resolve();
      });
      expect(result.current.state).toEqual({ status: 'loaded', data: 'fast' });
    });

    it('honours isEmpty like a normal load', async () => {
      let call = 0;
      const { result } = renderHook(() =>
        useResource(
          () => Promise.resolve(++call === 1 ? [1] : []),
          [],
          (d) => d.length === 0,
        ),
      );
      await waitFor(() => expect(result.current.state.status).toBe('loaded'));
      await act(() => {
        result.current.refresh();
        return Promise.resolve();
      });
      expect(result.current.state.status).toBe('empty');
    });
  });
});
