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

class FakeFile {
  constructor(public data: Uint8Array = new Uint8Array()) {}
  getFile(): Promise<{ arrayBuffer: () => Promise<ArrayBuffer>; text: () => Promise<string> }> {
    const bytes = this.data;
    return Promise.resolve({
      arrayBuffer: () =>
        Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
      text: () => Promise.resolve(new TextDecoder().decode(bytes)),
    });
  }
  createWritable(): Promise<{
    write: (d: Uint8Array | string) => Promise<void>;
    close: () => Promise<void>;
  }> {
    return Promise.resolve({
      write: (d: Uint8Array | string) => {
        this.data = typeof d === 'string' ? new TextEncoder().encode(d) : d;
        return Promise.resolve();
      },
      close: () => Promise.resolve(),
    });
  }
}

class FakeDir {
  children = new Map<string, Node>();

  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FakeDir> {
    let node = this.children.get(name);
    if (!node) {
      if (!opts?.create) return Promise.reject(new Error(`NotFound: ${name}`));
      node = new FakeDir();
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
  return new FakeDir() as unknown as FileSystemDirectoryHandle;
}
