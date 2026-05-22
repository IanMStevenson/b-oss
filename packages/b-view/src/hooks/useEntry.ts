// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useState, useEffect } from 'react';
import type { BlipEntry } from '../types.js';

export type EntryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: BlipEntry };

export function useEntry(jsonPath: string | null): EntryState {
  const [state, setState] = useState<EntryState>({ status: 'idle' });

  useEffect(() => {
    if (jsonPath === null) {
      setState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    fetch(jsonPath)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<BlipEntry>;
      })
      .then((data) => {
        if (cancelled) return;
        setState({ status: 'loaded', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [jsonPath]);

  return state;
}
