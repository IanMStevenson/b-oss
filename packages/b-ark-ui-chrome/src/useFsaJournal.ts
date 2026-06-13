// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BlipEntry, JournalMetadata } from '@b-oss/b-view';
import type { EntryState } from '@b-oss/b-view';

export type FsaJournalState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: JournalMetadata }
  | { status: 'error'; error: string };

export async function getNestedFileHandle(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemFileHandle> {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  let dir: FileSystemDirectoryHandle = root;
  for (const seg of parts.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(seg);
  }
  return dir.getFileHandle(parts[parts.length - 1]);
}

export async function readFileText(root: FileSystemDirectoryHandle, path: string): Promise<string> {
  const fileHandle = await getNestedFileHandle(root, path);
  return (await fileHandle.getFile()).text();
}

export function useFsaJournal(
  handle: FileSystemDirectoryHandle | null,
  username: string | null,
  refreshNonce: number,
): FsaJournalState {
  const [state, setState] = useState<FsaJournalState>({ status: 'idle' });

  useEffect(() => {
    if (!handle || !username) {
      setState({ status: 'idle' });
      return;
    }
    setState({ status: 'loading' });
    let cancelled = false;
    readFileText(handle, `${username}/journal.json`)
      .then((text) => {
        if (cancelled) return;
        setState({ status: 'loaded', data: JSON.parse(text) as JournalMetadata });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Unknown error';
        setState({ status: 'error', error: msg });
      });
    return () => {
      cancelled = true;
    };
  }, [handle, username, refreshNonce]);

  return state;
}

// Resolves entry asset paths (relative to the account's `{username}/` folder) to object URLs.
// Mirrors b-view's useFolderAccess but with the Chrome `{username}/` prefix; caches blob URLs
// and revokes them when the folder or account changes.
export function useFsaAssets(
  dirHandle: FileSystemDirectoryHandle | null,
  username: string | null,
): { resolveAsset: (path: string) => Promise<string> } {
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
    const fileHandle = await getNestedFileHandle(dir, `${user}/${path}`);
    const file = await fileHandle.getFile();
    const url = URL.createObjectURL(file);
    blobCache.current.set(path, url);
    return url;
  }, []); // stable — reads dirHandle/username via refs at call time

  return { resolveAsset };
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
