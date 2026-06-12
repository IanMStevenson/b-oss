// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// FSA handle persistence in IndexedDB + permission helpers.
// Ported from spikes/fsa-bg-tab/idb.js and writer.js.

import { openDb, STORE_CONFIG } from './db.js';

const DIR_KEY = 'dir';

export async function saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_CONFIG, 'readwrite');
    tx.objectStore(STORE_CONFIG).put(handle, DIR_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IDB transaction failed'));
  });
  db.close();
}

export async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb();
  const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
    const tx = db.transaction(STORE_CONFIG, 'readonly');
    const req = tx.objectStore(STORE_CONFIG).get(DIR_KEY);
    req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error('IDB get failed'));
  });
  db.close();
  return handle;
}

/**
 * Query the current permission state of a stored handle.
 * Returns null if the handle is stale (e.g. after extension reinstall) — caller
 * should treat null as "no handle" and prompt a fresh folder pick.
 */
export async function queryFsaPermission(
  handle: FileSystemDirectoryHandle,
): Promise<PermissionState | null> {
  try {
    return await handle.queryPermission({ mode: 'readwrite' });
  } catch {
    return null;
  }
}

/**
 * Request readwrite permission on an FSA handle.
 * MUST be called from a user-gesture handler — Chrome throws otherwise.
 */
export async function requestFsaPermission(
  handle: FileSystemDirectoryHandle,
): Promise<PermissionState> {
  return handle.requestPermission({ mode: 'readwrite' });
}
