// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import {
  generateId,
  generateSecret,
  hashSecret,
  timingSafeEqualHex,
  importEncryptionKey,
  encryptReadToken,
  decryptReadToken,
} from '../crypto.js';

function testKeyBase64(): string {
  const bytes = new Uint8Array(32).fill(7);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

describe('generateId / generateSecret', () => {
  it('produces distinct values each call', () => {
    expect(generateId()).not.toBe(generateId());
    expect(generateSecret()).not.toBe(generateSecret());
  });

  it('generateSecret is URL-safe (no +, /, or = padding)', () => {
    const secret = generateSecret();
    expect(secret).not.toMatch(/[+/=]/);
    expect(secret.length).toBeGreaterThan(30);
  });
});

describe('hashSecret / timingSafeEqualHex', () => {
  it('is deterministic for the same input', async () => {
    const a = await hashSecret('my-secret');
    const b = await hashSecret('my-secret');
    expect(a).toBe(b);
    expect(timingSafeEqualHex(a, b)).toBe(true);
  });

  it('differs for different input', async () => {
    const a = await hashSecret('secret-one');
    const b = await hashSecret('secret-two');
    expect(a).not.toBe(b);
    expect(timingSafeEqualHex(a, b)).toBe(false);
  });

  it('timingSafeEqualHex rejects differing lengths without throwing', () => {
    expect(timingSafeEqualHex('ab', 'abcd')).toBe(false);
  });
});

describe('encryptReadToken / decryptReadToken', () => {
  it('round-trips the plaintext', async () => {
    const key = await importEncryptionKey(testKeyBase64());
    const encrypted = await encryptReadToken('a-real-blipfoto-read-token', key);
    const decrypted = await decryptReadToken(encrypted, key);
    expect(decrypted).toBe('a-real-blipfoto-read-token');
  });

  it('uses a fresh nonce per call, so ciphertext differs even for identical plaintext', async () => {
    const key = await importEncryptionKey(testKeyBase64());
    const first = await encryptReadToken('same-token', key);
    const second = await encryptReadToken('same-token', key);
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it('fails to decrypt under the wrong key', async () => {
    const key = await importEncryptionKey(testKeyBase64());
    const encrypted = await encryptReadToken('a-real-blipfoto-read-token', key);
    const wrongKeyBytes = new Uint8Array(32).fill(9);
    let binary = '';
    for (const b of wrongKeyBytes) binary += String.fromCharCode(b);
    const wrongKey = await importEncryptionKey(btoa(binary));
    await expect(decryptReadToken(encrypted, wrongKey)).rejects.toThrow();
  });
});
