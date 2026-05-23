// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useState, useEffect, useRef } from 'react';
import type { JournalMetadata } from '../types.js';

export type JournalState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: JournalMetadata };

async function fetchJournal(url: string): Promise<JournalMetadata> {
  const res = await fetch(`${url}?t=${Date.now()}`);
  if (res.status === 404) throw new Error('journal.json not found');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as JournalMetadata;
  if (data.schema_version !== 1) {
    throw new Error(
      `Unsupported journal schema version: ${String((data as unknown as Record<string, unknown>)['schema_version'])}`,
    );
  }
  return data;
}

export function useJournal(journalUrl?: string, refreshIntervalMs?: number): JournalState {
  const [state, setState] = useState<JournalState>({ status: 'loading' });
  const entryCountRef = useRef<number | null>(null);

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
    entryCountRef.current = null;

    fetchJournal(url)
      .then((data) => {
        if (cancelled) return;
        entryCountRef.current = data.entries.length;
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

  useEffect(() => {
    if (!refreshIntervalMs || !journalUrl) return;
    if (window.location.protocol === 'file:') return;

    const url = journalUrl;
    const id = setInterval(() => {
      fetchJournal(url)
        .then((data) => {
          if (data.entries.length !== entryCountRef.current) {
            entryCountRef.current = data.entries.length;
            setState({ status: 'loaded', data });
          }
        })
        .catch(() => {
          // Silently ignore poll errors — the initial load already surfaced any error state
        });
    }, refreshIntervalMs);

    return () => clearInterval(id);
  }, [journalUrl, refreshIntervalMs]);

  return state;
}
