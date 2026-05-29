// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useState, useEffect, useRef } from 'react';
import type { BlipEntry, EntryIndex } from '../types.js';

export type SearchStatus = 'idle' | 'scanning' | 'done';

export interface SearchState {
  results: EntryIndex[];
  status: SearchStatus;
  progress: { loaded: number; total: number };
}

const BATCH_SIZE = 20;

// Progressively searches entry titles (instant), then fetches each entry JSON
// to match description and tags. Results update after each batch of BATCH_SIZE
// fetches. The resolveEntry callback is expected to be stable (useCallback).
export function useSearchEntries(
  query: string,
  entries: EntryIndex[],
  resolveEntry: (jsonPath: string) => Promise<BlipEntry>,
): SearchState {
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [results, setResults] = useState<EntryIndex[]>(entries);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const genRef = useRef(0);

  // Debounce: apply immediately when clearing, delay when typing
  useEffect(() => {
    if (query === '') {
      setDebouncedQuery('');
      return;
    }
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (debouncedQuery === '') {
      setResults(entries);
      setStatus('idle');
      setProgress({ loaded: 0, total: 0 });
      return;
    }

    const gen = ++genRef.current;
    const q = debouncedQuery.toLowerCase();

    // Phase 1: instant title match
    const matchedIds = new Set<string>();
    for (const e of entries) {
      if (e.title.toLowerCase().includes(q)) matchedIds.add(e.entry_id);
    }
    setResults(entries.filter((e) => matchedIds.has(e.entry_id)));
    setStatus('scanning');
    setProgress({ loaded: 0, total: entries.length });

    let loadedCount = 0;

    async function processBatch(startIdx: number): Promise<void> {
      if (gen !== genRef.current) return;

      const batch = entries.slice(startIdx, startIdx + BATCH_SIZE);
      if (batch.length === 0) {
        setStatus('done');
        return;
      }

      await Promise.all(
        batch.map(async (e) => {
          try {
            const full = await resolveEntry(e.json_path);
            if (gen !== genRef.current) return;
            if (
              full.description.toLowerCase().includes(q) ||
              full.tags.some((t) => t.toLowerCase().includes(q))
            ) {
              matchedIds.add(e.entry_id);
            }
          } catch {
            // ignore failed loads
          }
          loadedCount++;
        }),
      );

      if (gen !== genRef.current) return;
      setResults(entries.filter((e) => matchedIds.has(e.entry_id)));
      setProgress({ loaded: loadedCount, total: entries.length });
      await processBatch(startIdx + BATCH_SIZE);
    }

    void processBatch(0);
  }, [debouncedQuery, entries, resolveEntry]);

  return { results, status, progress };
}
