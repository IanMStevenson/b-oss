// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useState, useEffect } from 'react';
import type { JournalMetadata } from '../types.js';

export type JournalState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: JournalMetadata };

export function useJournal(journalUrl?: string): JournalState {
  const [state, setState] = useState<JournalState>({ status: 'loading' });

  useEffect(() => {
    if (window.location.protocol === 'file:') {
      setState({
        status: 'error',
        message:
          "To browse your journal, open it through b-ark's viewer or upload the folder to a web host. Direct file access is not supported by browsers.",
      });
      return;
    }

    const url = journalUrl ?? './journal.json';
    let cancelled = false;

    setState({ status: 'loading' });

    fetch(url)
      .then(async (res) => {
        if (res.status === 404) throw new Error('journal.json not found');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<JournalMetadata>;
      })
      .then((data) => {
        if (cancelled) return;
        if (data.schema_version !== 1) {
          setState({
            status: 'error',
            message: `Unsupported journal schema version: ${String((data as unknown as Record<string, unknown>)['schema_version'])}`,
          });
          return;
        }
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
  }, [journalUrl]);

  return state;
}
