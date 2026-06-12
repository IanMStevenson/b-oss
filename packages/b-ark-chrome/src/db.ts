// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Single shared IndexedDB instance for b-ark-chrome.
// - STORE_CONFIG: FSA directory handle + misc config (key: 'dir')
// - STORE_KEYS:   AES-GCM CryptoKey for token encryption (key: 'aes-gcm')

export const DB_NAME = 'b-ark-chrome-db';
export const DB_VERSION = 1;
export const STORE_CONFIG = 'config';
export const STORE_KEYS = 'keys';

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CONFIG)) db.createObjectStore(STORE_CONFIG);
      if (!db.objectStoreNames.contains(STORE_KEYS)) db.createObjectStore(STORE_KEYS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}
