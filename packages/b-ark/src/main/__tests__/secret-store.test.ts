// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { beforeEach, describe, expect, it, vi } from 'vitest';

const safeStorage = vi.hoisted(() => ({
  isAsyncEncryptionAvailable: vi.fn(),
  encryptStringAsync: vi.fn(),
  decryptStringAsync: vi.fn(),
}));
vi.mock('electron', () => ({ safeStorage }));

import { encryptSecret, decryptSecret } from '../secret-store.js';

beforeEach(() => {
  vi.resetAllMocks();
  safeStorage.isAsyncEncryptionAvailable.mockResolvedValue(true);
});

describe('encryptSecret', () => {
  it('returns base64 of the async ciphertext', async () => {
    safeStorage.encryptStringAsync.mockResolvedValue(Buffer.from([1, 2, 3]));
    await expect(encryptSecret('x')).resolves.toBe(Buffer.from([1, 2, 3]).toString('base64'));
  });

  it('throws when encryption is unavailable', async () => {
    safeStorage.isAsyncEncryptionAvailable.mockResolvedValue(false);
    await expect(encryptSecret('x')).rejects.toThrow(/not available/);
  });
});

describe('decryptSecret', () => {
  it('decrypts base64 ciphertext (same wire format as the old sync API)', async () => {
    safeStorage.decryptStringAsync.mockResolvedValue({ shouldReEncrypt: false, result: 'plain' });
    await expect(decryptSecret(Buffer.from([9, 8]).toString('base64'))).resolves.toBe('plain');
    expect(safeStorage.decryptStringAsync).toHaveBeenCalledWith(Buffer.from([9, 8]));
  });

  it('decrypts again when Electron reports the key was rotated', async () => {
    safeStorage.decryptStringAsync
      .mockResolvedValueOnce({ shouldReEncrypt: true, result: 'stale' })
      .mockResolvedValueOnce({ shouldReEncrypt: false, result: 'fresh' });
    await expect(decryptSecret('AQ==')).resolves.toBe('fresh');
  });

  it('throws when encryption is unavailable', async () => {
    safeStorage.isAsyncEncryptionAvailable.mockResolvedValue(false);
    await expect(decryptSecret('AQ==')).rejects.toThrow(/not available/);
  });
});
