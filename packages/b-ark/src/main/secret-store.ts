// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { safeStorage } from 'electron';

/**
 * Generic OS-keychain-backed string encryption, used for any secret persisted
 * to disk that isn't an OAuth access token (those keep their own dedicated
 * helpers in oauth.ts with token-specific error text). Same base64 wire format.
 */
export async function encryptSecret(plaintext: string): Promise<string> {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error('safeStorage encryption is not available on this platform');
  }
  return (await safeStorage.encryptStringAsync(plaintext)).toString('base64');
}

/**
 * Also decrypts ciphertext written by the old synchronous `encryptString`
 * (Electron docs: "Data encrypted with `safeStorage.encryptString` can be
 * decrypted with `safeStorage.decryptStringAsync`").
 */
export async function decryptSecret(ciphertextB64: string): Promise<string> {
  if (!(await safeStorage.isAsyncEncryptionAvailable())) {
    throw new Error('safeStorage encryption is not available — cannot decrypt stored secret');
  }
  const encrypted = Buffer.from(ciphertextB64, 'base64');
  const first = await safeStorage.decryptStringAsync(encrypted);
  // The key was rotated / upgraded: Electron says to decrypt again for the
  // current plaintext.
  if (first.shouldReEncrypt) return (await safeStorage.decryptStringAsync(encrypted)).result;
  return first.result;
}
