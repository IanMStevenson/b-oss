// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BlipEntry, JournalMetadata } from '@b-oss/b-view';
import type { EntryState } from '@b-oss/b-view';
import { debug } from './debug.js';
import { getNestedFileHandle, readFileText, readJournal } from './journal-source.js';

// Re-export the FSA read helpers so existing importers (e.g. BackupPage) keep working.
export { getNestedFileHandle, readFileText };

export type FsaJournalState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: JournalMetadata; pollTick: number }
  | { status: 'error'; error: string };

export function useFsaJournal(
  handle: FileSystemDirectoryHandle | null,
  username: string | null,
  refreshNonce: number,
  refreshIntervalMs?: number,
): FsaJournalState {
  const [state, setState] = useState<FsaJournalState>({ status: 'idle' });
  const entryCountRef = useRef<number | null>(null);
  const pollTickRef = useRef<number>(0);
  const lastNonceRef = useRef<number>(refreshNonce);

  // Effect 1: Initial load — shows loading state, seeds entryCountRef
  useEffect(() => {
    if (!handle || !username) {
      setState({ status: 'idle' });
      entryCountRef.current = null;
      return;
    }
    setState({ status: 'loading' });
    let cancelled = false;
    readJournal(handle, username)
      .then((data) => {
        if (cancelled) return;
        entryCountRef.current = data.entries.length;
        setState({ status: 'loaded', data, pollTick: 0 });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Unknown error';
        setState({ status: 'error', error: msg });
      });
    return () => {
      cancelled = true;
    };
  }, [handle, username]);

  // Effect 2: Polling during backup — updates data when entry count changes;
  // always increments pollTick so stuck thumbnail loads can retry each cycle.
  useEffect(() => {
    if (!refreshIntervalMs || !handle || !username) return;
    const id = setInterval(() => {
      readJournal(handle, username)
        .then((data) => {
          pollTickRef.current += 1;
          const tick = pollTickRef.current;
          if (data.entries.length !== entryCountRef.current) {
            entryCountRef.current = data.entries.length;
            setState({ status: 'loaded', data, pollTick: tick });
          } else {
            setState((prev) => (prev.status === 'loaded' ? { ...prev, pollTick: tick } : prev));
          }
        })
        .catch((err: unknown) => {
          // Keep the last-good state on poll errors — the initial load already surfaced any
          // hard error. Leave a breadcrumb so transient poll failures are debuggable.
          debug.warn('[b-ark] journal poll failed:', err);
        });
    }, refreshIntervalMs);
    return () => clearInterval(id);
  }, [handle, username, refreshIntervalMs]);

  // Effect 3: Forced refresh on nonce change — silent, catches fast backups where
  // the interval may not have fired before isBackingUp flipped false
  useEffect(() => {
    if (refreshNonce === lastNonceRef.current) return;
    lastNonceRef.current = refreshNonce;
    if (!handle || !username) return;
    readJournal(handle, username)
      .then((data) => {
        entryCountRef.current = data.entries.length;
        setState({ status: 'loaded', data, pollTick: 0 });
      })
      .catch((err: unknown) => {
        // Keep showing existing state on refresh errors; leave a breadcrumb for debugging.
        debug.warn('[b-ark] journal refresh failed:', err);
      });
  }, [refreshNonce, handle, username]);

  return state;
}

// Resolves entry asset paths (relative to the account's `{username}/` folder) to object URLs.
// Mirrors b-view's useFolderAccess but with the Chrome `{username}/` prefix; caches blob URLs
// and revokes them when the folder or account changes.
export function useFsaAssets(
  dirHandle: FileSystemDirectoryHandle | null,
  username: string | null,
): { resolveAsset: (path: string) => Promise<string>; invalidateAsset: (path: string) => void } {
  const blobCache = useRef<Map<string, string>>(new Map());
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(dirHandle);
  dirHandleRef.current = dirHandle;
  const usernameRef = useRef<string | null>(username);
  usernameRef.current = username;

  useEffect(() => {
    return () => {
      for (const url of blobCache.current.values()) {
        URL.revokeObjectURL(url);
      }
      blobCache.current = new Map();
    };
  }, [dirHandle, username]);

  const resolveAsset = useCallback(async (path: string): Promise<string> => {
    const dir = dirHandleRef.current;
    const user = usernameRef.current;
    if (!dir || !user) throw new Error('No folder selected');
    const cached = blobCache.current.get(path);
    if (cached) return cached;
    // Retry up to 3 times with a short delay — the FSA can return transient
    // errors (e.g. NoModificationAllowedError) when the backup engine holds a
    // writable stream open on a file in the same directory.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise<void>((r) => setTimeout(r, 300 * attempt));
      try {
        const fileHandle = await getNestedFileHandle(dir, `${user}/${path}`);
        const file = await fileHandle.getFile();
        const url = URL.createObjectURL(file);
        blobCache.current.set(path, url);
        return url;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }, []); // stable — reads dirHandle/username via refs at call time

  const invalidateAsset = useCallback((path: string): void => {
    const url = blobCache.current.get(path);
    if (url) URL.revokeObjectURL(url);
    blobCache.current.delete(path);
  }, []);

  return { resolveAsset, invalidateAsset };
}

// Loads a single entry's JSON from `{username}/{jsonPath}` into an EntryState.
// Mirrors b-view's useFolderEntry with the Chrome `{username}/` prefix.
export function useFsaEntry(
  dirHandle: FileSystemDirectoryHandle | null,
  username: string | null,
  jsonPath: string | null,
): EntryState {
  const [state, setState] = useState<EntryState>({ status: 'idle' });

  useEffect(() => {
    if (!dirHandle || !username || jsonPath === null) {
      setState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    readFileText(dirHandle, `${username}/${jsonPath}`)
      .then((text) => {
        if (cancelled) return;
        setState({ status: 'loaded', data: JSON.parse(text) as BlipEntry });
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
  }, [dirHandle, username, jsonPath]);

  return state;
}
