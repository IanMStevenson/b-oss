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
  constructor(reason = 'Secure storage is not available on this system') {
    super(`${reason}, so nothing was read or written.`);
    this.name = 'SecureStorageUnavailableError';
  }
}

/** How long to wait for the OS keystore before giving up. A locked or missing keyring can leave
 * the async safeStorage calls waiting forever (seen with libsecret and no unlocked keyring), which
 * would hang every screen that reads a token. */
export const DEFAULT_KEYSTORE_TIMEOUT_MS = 10_000;

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
    private readonly timeoutMs = DEFAULT_KEYSTORE_TIMEOUT_MS,
  ) {}

  get(key: unknown): Promise<string | null> {
    checkKey(key);
    return this.enqueue(async () => {
      await this.requireAvailable();
      const data = await this.load();
      const stored = data.items[key];
      if (stored === undefined) return null;
      const { result, shouldReEncrypt } = await this.guard(
        this.crypto.decrypt(Buffer.from(stored, 'base64')),
      );
      if (shouldReEncrypt) {
        data.items[key] = (await this.guard(this.crypto.encrypt(result))).toString('base64');
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
      data.items[key] = (await this.guard(this.crypto.encrypt(value))).toString('base64');
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
    if (!(await this.guard(this.crypto.isAvailable()))) throw new SecureStorageUnavailableError();
  }

  /** Fails with SecureStorageUnavailableError if the keystore does not answer in time. */
  private guard<T>(call: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new SecureStorageUnavailableError(
              'Secure storage did not respond (is the keyring locked?)',
            ),
          ),
        this.timeoutMs,
      );
      call.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (err: unknown) => {
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        },
      );
    });
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
