// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useEffect, useState } from 'react';
import type { JournalMetadata } from '@b-oss/b-view';

export type FsaJournalState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: JournalMetadata }
  | { status: 'error'; error: string };

export async function readFileText(root: FileSystemDirectoryHandle, path: string): Promise<string> {
  const parts = path.split('/').filter(Boolean);
  let dir: FileSystemDirectoryHandle = root;
  for (const seg of parts.slice(0, -1)) {
    dir = await dir.getDirectoryHandle(seg);
  }
  const name = parts.at(-1)!;
  const fileHandle = await dir.getFileHandle(name);
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
