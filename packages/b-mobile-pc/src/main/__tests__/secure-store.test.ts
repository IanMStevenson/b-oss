// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

/* eslint-disable @typescript-eslint/require-await -- the fakes implement async interfaces */
import { describe, it, expect } from 'vitest';
import {
  SecureStorageUnavailableError,
  SecureStore,
  type SecretCrypto,
  type StoreFile,
} from '../secure-store.js';

// A reversible "encryption" that is obviously not plaintext, so tests can check ciphertext is what is stored.
function fakeCrypto(
  opts: { available?: boolean; reEncrypt?: boolean } = {},
): SecretCrypto & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    isAvailable: async () => opts.available ?? true,
    encrypt: async (s) => {
      calls.push('encrypt');
      return Buffer.from('ENC:' + [...s].reverse().join(''));
    },
    decrypt: async (b) => {
      calls.push('decrypt');
      return {
        result: [...b.toString().slice(4)].reverse().join(''),
        shouldReEncrypt: opts.reEncrypt ?? false,
      };
    },
  };
}

function memoryFile(
  initial: string | null = null,
): StoreFile & { contents: string | null; writes: number } {
  const f = {
    contents: initial,
    writes: 0,
    read: async () => f.contents,
    write: async (s: string) => {
      f.writes++;
      f.contents = s;
    },
  };
  return f;
}

describe('SecureStore', () => {
  it('round-trips a value and stores only ciphertext', async () => {
    const file = memoryFile();
    const store = new SecureStore(fakeCrypto(), file);
    await store.set('token:alice:app', 'secret-token');
    expect(await store.get('token:alice:app')).toBe('secret-token');
    expect(file.contents).not.toContain('secret-token');
    expect(file.contents).not.toContain('nekot-terces');
  });

  it('returns null for a missing key and tolerates removing one', async () => {
    const store = new SecureStore(fakeCrypto(), memoryFile());
    expect(await store.get('nope')).toBeNull();
    await expect(store.remove('nope')).resolves.toBeUndefined();
  });

  it('removes a value', async () => {
    const store = new SecureStore(fakeCrypto(), memoryFile());
    await store.set('k', 'v');
    await store.remove('k');
    expect(await store.get('k')).toBeNull();
  });

  it('refuses to read or write when real encryption is unavailable, and writes nothing', async () => {
    const file = memoryFile();
    const store = new SecureStore(fakeCrypto({ available: false }), file);
    await expect(store.set('k', 'v')).rejects.toBeInstanceOf(SecureStorageUnavailableError);
    await expect(store.get('k')).rejects.toBeInstanceOf(SecureStorageUnavailableError);
    expect(file.writes).toBe(0);
  });

  it('re-encrypts and saves when the OS says the stored value is stale', async () => {
    const crypto = fakeCrypto();
    const file = memoryFile();
    await new SecureStore(crypto, file).set('k', 'v');
    const writesBefore = file.writes;
    const stale = fakeCrypto({ reEncrypt: true });
    expect(await new SecureStore(stale, file).get('k')).toBe('v');
    expect(file.writes).toBe(writesBefore + 1);
    expect(stale.calls).toEqual(['decrypt', 'encrypt']);
  });

  it('serialises concurrent writes so none is lost', async () => {
    const store = new SecureStore(fakeCrypto(), memoryFile());
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.set(`k${i}`, `v${i}`)));
    for (let i = 0; i < 20; i++) expect(await store.get(`k${i}`)).toBe(`v${i}`);
  });

  it('keeps working after one operation fails', async () => {
    const crypto = fakeCrypto();
    const store = new SecureStore(crypto, memoryFile());
    crypto.encrypt = async () => {
      throw new Error('boom');
    };
    await expect(store.set('a', '1')).rejects.toThrow('boom');
    crypto.encrypt = async (s) => Buffer.from('ENC:' + [...s].reverse().join(''));
    await store.set('b', '2');
    expect(await store.get('b')).toBe('2');
  });

  it('validates keys and values', () => {
    const store = new SecureStore(fakeCrypto(), memoryFile());
    expect(() => store.get('')).toThrow(TypeError);
    expect(() => store.get(42)).toThrow(TypeError);
    expect(() => store.set('k', 5)).toThrow(TypeError);
    expect(() => store.set('k', 'x'.repeat(70_000))).toThrow(TypeError);
    expect(() => store.set('x'.repeat(300), 'v')).toThrow(TypeError);
  });

  it('rejects a file in an unknown format rather than overwriting it', async () => {
    const file = memoryFile('{"v":2,"items":{}}');
    const store = new SecureStore(fakeCrypto(), file);
    await expect(store.set('k', 'v')).rejects.toThrow('unrecognised format');
    expect(file.contents).toBe('{"v":2,"items":{}}');
  });
});
