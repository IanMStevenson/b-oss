// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Minimal raw-IndexedDB handle store, mirroring the proven VHA pattern:
// one db, one object store, one key holding a serialized FileSystemDirectoryHandle.
// Handles structured-clone into IDB and survive browser restarts; the *permission*
// on them may not — that is exactly what this spike measures.

const DB_NAME = 'fsa-spike-db';
const STORE = 'config';
const KEY = 'dir';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbPutHandle(handle) {
  const db = await open();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(handle, KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function idbGetHandle() {
  const db = await open();
  const handle = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const rq = tx.objectStore(STORE).get(KEY);
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror = () => reject(rq.error);
  });
  db.close();
  return handle || null;
}
