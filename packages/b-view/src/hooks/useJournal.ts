// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useState, useEffect, useRef } from 'react';
import type { JournalMetadata } from '../types.js';

export type JournalState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: JournalMetadata };

// A file:// origin can fetch absolute http(s) URLs (b-ark's embedded viewer
// does exactly this against its local server) but cannot fetch relative URLs.
// The blanket short-circuit below targets only the latter — the case where
// someone double-clicks the standalone viewer's index.html on disk.
function fileOriginBlocksFetch(url: string): boolean {
  if (/^https?:/i.test(url)) return false;
  return window.location.protocol === 'file:';
}

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

export function useJournal(
  journalUrl?: string,
  refreshIntervalMs?: number,
  refreshNonce?: number,
): JournalState {
  const [state, setState] = useState<JournalState>({ status: 'loading' });
  const entryCountRef = useRef<number | null>(null);
  const lastNonceRef = useRef<number | undefined>(refreshNonce);

  useEffect(() => {
    const url = journalUrl ?? './journal.json';
    if (fileOriginBlocksFetch(url)) {
      setState({
        status: 'error',
        message:
          "To browse your journal, open it through b-ark's viewer or upload the folder to a web host. Direct file access is not supported by browsers.",
      });
      return;
    }

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
    if (fileOriginBlocksFetch(journalUrl)) return;

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

  // Forced refetch trigger: callers bump refreshNonce to request a fresh read
  // (e.g. after a backup completes, since the polling setInterval may not have
  // fired before isBackingUp flipped false on a fast backup).
  useEffect(() => {
    if (refreshNonce === undefined) return;
    if (refreshNonce === lastNonceRef.current) return;
    lastNonceRef.current = refreshNonce;
    if (!journalUrl) return;
    if (fileOriginBlocksFetch(journalUrl)) return;

    let cancelled = false;
    fetchJournal(journalUrl)
      .then((data) => {
        if (cancelled) return;
        entryCountRef.current = data.entries.length;
        setState({ status: 'loaded', data });
      })
      .catch(() => {
        // Silently ignore refresh errors — keep showing existing state
      });
    return () => {
      cancelled = true;
    };
  }, [refreshNonce, journalUrl]);

  return state;
}
