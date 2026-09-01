// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Test doubles for the browser APIs the chrome modules touch: chrome.storage.local and the
// File System Access directory handle. Kept dependency-free (plain in-memory maps).

interface GlobalWithChrome {
  chrome?: unknown;
}

export interface FakeChromeStorage {
  store: Map<string, unknown>;
  uninstall: () => void;
}

/** Install a minimal in-memory chrome.storage.local onto globalThis. */
export function installChromeStorageLocal(): FakeChromeStorage {
  const store = new Map<string, unknown>();
  const local = {
    get(keys?: string | string[] | null): Promise<Record<string, unknown>> {
      if (keys === undefined || keys === null) return Promise.resolve(Object.fromEntries(store));
      const arr = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of arr) if (store.has(k)) out[k] = store.get(k);
      return Promise.resolve(out);
    },
    set(items: Record<string, unknown>): Promise<void> {
      for (const [k, v] of Object.entries(items)) store.set(k, v);
      return Promise.resolve();
    },
    remove(keys: string | string[]): Promise<void> {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) store.delete(k);
      return Promise.resolve();
    },
  };
  const g = globalThis as GlobalWithChrome;
  const prior = g.chrome;
  g.chrome = { storage: { local } };
  return {
    store,
    uninstall: () => {
      g.chrome = prior;
    },
  };
}

// ── Fake File System Access directory handle ──────────────────────────────────

type Node = FakeDir | FakeFile;

type WriteInput =
  Uint8Array | string | { type: 'write'; position?: number; data: Uint8Array | string };

class FakeFile {
  constructor(public data: Uint8Array = new Uint8Array()) {}
  getFile(): Promise<{
    size: number;
    arrayBuffer: () => Promise<ArrayBuffer>;
    text: () => Promise<string>;
  }> {
    const bytes = this.data;
    return Promise.resolve({
      size: bytes.length,
      // Copy the view's bytes into a fresh, plain ArrayBuffer. `bytes.buffer` is typed
      // ArrayBufferLike (ArrayBuffer | SharedArrayBuffer), so slicing it wouldn't satisfy
      // the ArrayBuffer return type; constructing a new Uint8Array gives a plain one.
      arrayBuffer: () => Promise.resolve(new Uint8Array(bytes).buffer),
      text: () => Promise.resolve(new TextDecoder().decode(bytes)),
    });
  }
  createWritable(opts?: {
    keepExistingData?: boolean;
  }): Promise<{ write: (d: WriteInput) => Promise<void>; close: () => Promise<void> }> {
    // Explicitly `Uint8Array<ArrayBuffer>` (not the looser default `ArrayBufferLike`) so
    // every branch below — including copies of `this.data`, whose own field type defaults
    // loose — assigns cleanly.
    let buffer: Uint8Array<ArrayBuffer> = opts?.keepExistingData
      ? new Uint8Array(this.data)
      : new Uint8Array(0);
    const toBytes = (d: Uint8Array | string): Uint8Array<ArrayBuffer> =>
      typeof d === 'string' ? new TextEncoder().encode(d) : new Uint8Array(d);
    return Promise.resolve({
      write: (input: WriteInput) => {
        if (typeof input === 'string' || input instanceof Uint8Array) {
          // Matches every current single-shot writeFile()-style caller: one plain write
          // replaces the whole (empty, unless keepExistingData) buffer.
          buffer = toBytes(input);
          return Promise.resolve();
        }
        const bytes = toBytes(input.data);
        const position = input.position ?? 0;
        const end = position + bytes.length;
        if (end > buffer.length) {
          const grown = new Uint8Array(end);
          grown.set(buffer);
          buffer = grown;
        }
        buffer.set(bytes, position);
        return Promise.resolve();
      },
      close: () => {
        this.data = buffer;
        return Promise.resolve();
      },
    });
  }
}

/** Shared call-count instrumentation across a FakeDir tree, for asserting on directory-handle caching. */
export interface FakeDirStats {
  getDirectoryHandleCalls: number;
}

export class FakeDir {
  children = new Map<string, Node>();
  /** Set by tests to simulate a cached handle going stale (e.g. deleted/moved externally). */
  invalidated = false;

  constructor(private readonly stats: FakeDirStats) {}

  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FakeDir> {
    if (this.invalidated) {
      return Promise.reject(new Error('NotFoundError: stale directory handle'));
    }
    this.stats.getDirectoryHandleCalls++;
    let node = this.children.get(name);
    if (!node) {
      if (!opts?.create) return Promise.reject(new Error(`NotFound: ${name}`));
      node = new FakeDir(this.stats);
      this.children.set(name, node);
    }
    if (!(node instanceof FakeDir)) return Promise.reject(new Error(`TypeMismatch: ${name}`));
    return Promise.resolve(node);
  }

  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FakeFile> {
    let node = this.children.get(name);
    if (!node) {
      if (!opts?.create) return Promise.reject(new Error(`NotFound: ${name}`));
      node = new FakeFile();
      this.children.set(name, node);
    }
    if (!(node instanceof FakeFile)) return Promise.reject(new Error(`TypeMismatch: ${name}`));
    return Promise.resolve(node);
  }

  removeEntry(name: string): Promise<void> {
    this.children.delete(name);
    return Promise.resolve();
  }

  *values(): Generator<{ name: string }> {
    // A sync generator is fine — BrowserPlatformIO consumes this with `for await`.
    for (const name of this.children.keys()) yield { name };
  }
}

/** A fresh empty FSA directory handle backed by in-memory maps. */
export function createFakeDirHandle(): FileSystemDirectoryHandle {
  return new FakeDir({ getDirectoryHandleCalls: 0 }) as unknown as FileSystemDirectoryHandle;
}

/**
 * Like createFakeDirHandle(), but also exposes the underlying FakeDir tree (to simulate
 * external changes, e.g. a stale handle) and call-count stats (to assert caching behaviour).
 */
export function createFakeDirHandleWithStats(): {
  handle: FileSystemDirectoryHandle;
  root: FakeDir;
  stats: FakeDirStats;
} {
  const stats: FakeDirStats = { getDirectoryHandleCalls: 0 };
  const root = new FakeDir(stats);
  return { handle: root as unknown as FileSystemDirectoryHandle, root, stats };
}
