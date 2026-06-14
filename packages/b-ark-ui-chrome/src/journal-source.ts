// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The single FSA journal-read seam, shared by the React hook (useFsaJournal) and the
// non-React BrowserBackend.getStore(). Pure (no React) so the backend can import it
// without pulling in hook machinery. Reads `${username}/journal.json` from the granted
// FileSystemDirectoryHandle; throws if the file is absent or unreadable — callers decide
// whether that surfaces as an error or falls back to persisted status.

import type { JournalMetadata } from '@b-oss/b-view';

/** Walk a `a/b/c.json` path from a directory handle to the leaf file handle. */
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

/** Read a file's text content from a directory handle. */
export async function readFileText(root: FileSystemDirectoryHandle, path: string): Promise<string> {
  const fileHandle = await getNestedFileHandle(root, path);
  return (await fileHandle.getFile()).text();
}

/** Read and parse `${username}/journal.json`. Throws if absent/unreadable/invalid. */
export async function readJournal(
  handle: FileSystemDirectoryHandle,
  username: string,
): Promise<JournalMetadata> {
  const text = await readFileText(handle, `${username}/journal.json`);
  return JSON.parse(text) as JournalMetadata;
}
