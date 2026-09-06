// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { safeStorage } from 'electron';

/**
 * Generic OS-keychain-backed string encryption, used for any secret persisted
 * to disk that isn't an OAuth access token (those keep their own dedicated
 * helpers in oauth.ts with token-specific error text). Same base64 wire format.
 */
export function encryptSecret(plaintext: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage encryption is not available on this platform');
  }
  return safeStorage.encryptString(plaintext).toString('base64');
}

export function decryptSecret(ciphertextB64: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage encryption is not available — cannot decrypt stored secret');
  }
  return safeStorage.decryptString(Buffer.from(ciphertextB64, 'base64'));
}
