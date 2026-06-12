// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// AES-GCM encrypted token storage.
// Non-extractable CryptoKey lives in IndexedDB (structured-cloneable in Chrome);
// ciphertext + IV live in chrome.storage.local. Defeats casual storage/disk dumps.

import { openDb, STORE_KEYS } from './db.js';

const CRYPTO_KEY_ID = 'aes-gcm';
const STORAGE_CIPHERTEXT = 'tokenCiphertext';
const STORAGE_IV = 'tokenIv';

export interface StoredToken {
  accessToken: string;
  username: string;
}

// ── Key management ────────────────────────────────────────────────────────────

async function getOrCreateKey(): Promise<CryptoKey> {
  const db = await openDb();
  const existing = await new Promise<CryptoKey | null>((resolve, reject) => {
    const tx = db.transaction(STORE_KEYS, 'readonly');
    const req = tx.objectStore(STORE_KEYS).get(CRYPTO_KEY_ID);
    req.onsuccess = () => resolve((req.result as CryptoKey | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error('IDB key read failed'));
  });
  if (existing) {
    db.close();
    return existing;
  }
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_KEYS, 'readwrite');
    tx.objectStore(STORE_KEYS).put(key, CRYPTO_KEY_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IDB key write failed'));
  });
  db.close();
  return key;
}

// ── Encode / decode helpers ───────────────────────────────────────────────────

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

// Returns Uint8Array<ArrayBuffer> by constructing from ArrayLike<number>
function fromBase64(s: string): Uint8Array<ArrayBuffer> {
  const binary = atob(s);
  // new Uint8Array(ArrayLike<number>) → Uint8Array<ArrayBuffer>
  return new Uint8Array(Array.from({ length: binary.length }, (_, i) => binary.charCodeAt(i)));
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function storeToken(token: StoredToken): Promise<void> {
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(token));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  await chrome.storage.local.set({
    [STORAGE_CIPHERTEXT]: toBase64(new Uint8Array(ciphertext)),
    [STORAGE_IV]: toBase64(iv),
  });
}

export async function loadToken(): Promise<StoredToken | null> {
  const result = await chrome.storage.local.get([STORAGE_CIPHERTEXT, STORAGE_IV]);
  const ciphertextB64 = result[STORAGE_CIPHERTEXT] as string | undefined;
  const ivB64 = result[STORAGE_IV] as string | undefined;
  if (!ciphertextB64 || !ivB64) return null;
  try {
    const key = await getOrCreateKey();
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(ivB64) },
      key,
      fromBase64(ciphertextB64),
    );
    return JSON.parse(new TextDecoder().decode(plaintext)) as StoredToken;
  } catch {
    return null;
  }
}

export async function clearToken(): Promise<void> {
  await chrome.storage.local.remove([STORAGE_CIPHERTEXT, STORAGE_IV]);
}
