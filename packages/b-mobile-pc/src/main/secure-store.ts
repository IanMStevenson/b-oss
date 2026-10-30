// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Tokens and other secrets for the web app, encrypted with the OS keystore (Windows DPAPI, the
// macOS Keychain, Linux libsecret/kwallet) through Electron's async safeStorage API (the sync API
// is gone in Electron 46; b-ark's secret-store.ts is the pattern). Never plaintext: if the OS
// cannot encrypt, every operation fails loudly instead of quietly writing secrets to disk.
// The class takes its crypto and file IO as dependencies so it is testable without Electron.

export interface SecretCrypto {
  /** True only when real OS-backed encryption is available (not a plaintext fallback). */
  isAvailable(): Promise<boolean>;
  encrypt(plaintext: string): Promise<Buffer>;
  decrypt(ciphertext: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>;
}

export interface StoreFile {
  read(): Promise<string | null>;
  /** Must replace the file atomically (write a temp file, then rename). */
  write(contents: string): Promise<void>;
}

export class SecureStorageUnavailableError extends Error {
  constructor() {
    super('Secure storage is not available on this system, so nothing was read or written.');
    this.name = 'SecureStorageUnavailableError';
  }
}

interface StoreData {
  v: 1;
  items: Record<string, string>; // key -> base64 ciphertext
}

const MAX_KEY_LENGTH = 256;
const MAX_VALUE_LENGTH = 64 * 1024;

function checkKey(key: unknown): asserts key is string {
  if (typeof key !== 'string' || key.length === 0 || key.length > MAX_KEY_LENGTH) {
    throw new TypeError('Invalid secure storage key');
  }
}

export class SecureStore {
  // Operations run one at a time: each is a read-modify-write of one file.
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly crypto: SecretCrypto,
    private readonly file: StoreFile,
  ) {}

  get(key: unknown): Promise<string | null> {
    checkKey(key);
    return this.enqueue(async () => {
      await this.requireAvailable();
      const data = await this.load();
      const stored = data.items[key];
      if (stored === undefined) return null;
      const { result, shouldReEncrypt } = await this.crypto.decrypt(Buffer.from(stored, 'base64'));
      if (shouldReEncrypt) {
        data.items[key] = (await this.crypto.encrypt(result)).toString('base64');
        await this.save(data);
      }
      return result;
    });
  }

  set(key: unknown, value: unknown): Promise<void> {
    checkKey(key);
    if (typeof value !== 'string' || value.length > MAX_VALUE_LENGTH) {
      throw new TypeError('Invalid secure storage value');
    }
    return this.enqueue(async () => {
      await this.requireAvailable();
      const data = await this.load();
      data.items[key] = (await this.crypto.encrypt(value)).toString('base64');
      await this.save(data);
    });
  }

  remove(key: unknown): Promise<void> {
    checkKey(key);
    return this.enqueue(async () => {
      const data = await this.load();
      if (!(key in data.items)) return;
      delete data.items[key];
      await this.save(data);
    });
  }

  private enqueue<T>(op: () => Promise<T>): Promise<T> {
    const run = this.queue.then(op, op);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async requireAvailable(): Promise<void> {
    if (!(await this.crypto.isAvailable())) throw new SecureStorageUnavailableError();
  }

  private async load(): Promise<StoreData> {
    const raw = await this.file.read();
    if (raw === null) return { v: 1, items: {} };
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    if (parsed.v !== 1 || typeof parsed.items !== 'object' || parsed.items === null) {
      throw new Error('Secure storage file has an unrecognised format');
    }
    return { v: 1, items: { ...parsed.items } };
  }

  private async save(data: StoreData): Promise<void> {
    await this.file.write(JSON.stringify(data));
  }
}
