// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { PlatformIO, LogEntry } from '@b-oss/backup-engine';
import { debug } from './debug.js';

export class BrowserPlatformIO implements PlatformIO {
  // Resolved directory handles, keyed by path prefix (e.g. "gbradley/entries/2024") — a
  // full backup touches many files under a handful of directories (all entries in a given
  // year, say), and re-walking getDirectoryHandle() from the root for every single file op
  // was measurably wasteful. See b-oss#80.
  private readonly dirCache = new Map<string, FileSystemDirectoryHandle>();

  constructor(private readonly root: FileSystemDirectoryHandle) {}

  private segments(path: string): string[] {
    return path.split('/').filter((s) => s.length > 0);
  }

  /**
   * Resolve a directory, preferring cached handles. If the walk fails — e.g. a cached
   * handle went stale because the folder was deleted/moved outside our control — drop
   * every prefix we might have cached under this path and retry once against a clean walk,
   * rather than failing the whole operation over cache staleness.
   */
  private async resolveDir(segs: string[], create = false): Promise<FileSystemDirectoryHandle> {
    try {
      return await this.walkDir(segs, create);
    } catch (err) {
      if (segs.length === 0) throw err; // nothing cached for the root itself
      this.invalidateDirCache(segs);
      return this.walkDir(segs, create);
    }
  }

  private async walkDir(segs: string[], create: boolean): Promise<FileSystemDirectoryHandle> {
    let dir = this.root;
    let prefix = '';
    for (const seg of segs) {
      prefix = prefix ? `${prefix}/${seg}` : seg;
      const cached = this.dirCache.get(prefix);
      if (cached) {
        dir = cached;
        continue;
      }
      dir = await dir.getDirectoryHandle(seg, { create });
      this.dirCache.set(prefix, dir);
    }
    return dir;
  }

  private invalidateDirCache(segs: string[]): void {
    let prefix = '';
    for (const seg of segs) {
      prefix = prefix ? `${prefix}/${seg}` : seg;
      this.dirCache.delete(prefix);
    }
  }

  async readFile(path: string): Promise<Uint8Array> {
    const segs = this.segments(path);
    const filename = segs[segs.length - 1];
    const dir = await this.resolveDir(segs.slice(0, -1));
    const fh = await dir.getFileHandle(filename);
    const file = await fh.getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  async writeFile(path: string, data: Uint8Array | string): Promise<void> {
    const segs = this.segments(path);
    const filename = segs[segs.length - 1];
    const dir = await this.resolveDir(segs.slice(0, -1), true);
    const fh = await dir.getFileHandle(filename, { create: true });
    const w = await fh.createWritable();
    await w.write(data);
    await w.close();
  }

  // The File System Access API already makes writes atomic: createWritable() buffers into
  // a swap file and close() moves it into place as a single operation, so the destination is
  // never observed half-written. The explicit `.tmp`-then-rename dance the Electron PlatformIO
  // performs is therefore redundant here — writeFile() is itself the atomic write.
  async atomicWrite(path: string, data: Uint8Array | string): Promise<void> {
    await this.writeFile(path, data);
  }

  // True append: reads only the current file *size* (a cheap stat, not its content) and
  // writes new bytes at that position. keepExistingData:true has the browser preserve the
  // existing content in the swap file at the OS/file-system level, so this avoids the
  // JS-side read + decode + string-concat + re-encode a read-modify-write append would
  // otherwise pay on every call — see b-oss#80 (LogManager was doing exactly that).
  async appendFile(path: string, data: Uint8Array | string): Promise<void> {
    const segs = this.segments(path);
    const filename = segs[segs.length - 1];
    const dir = await this.resolveDir(segs.slice(0, -1), true);
    const fh = await dir.getFileHandle(filename, { create: true });
    const file = await fh.getFile();
    // Re-wrap into a fresh, plain-ArrayBuffer-backed view — an incoming Uint8Array's
    // buffer is typed ArrayBufferLike (ArrayBuffer | SharedArrayBuffer), which the
    // WriteParams `data` field doesn't accept.
    const bytes = typeof data === 'string' ? data : new Uint8Array(data);
    const w = await fh.createWritable({ keepExistingData: true });
    await w.write({ type: 'write', position: file.size, data: bytes });
    await w.close();
  }

  async ensureDir(path: string): Promise<void> {
    await this.resolveDir(this.segments(path), true);
  }

  async fileExists(path: string): Promise<boolean> {
    const segs = this.segments(path);
    const filename = segs[segs.length - 1];
    try {
      const dir = await this.resolveDir(segs.slice(0, -1));
      await dir.getFileHandle(filename);
      return true;
    } catch {
      return false;
    }
  }

  async listDir(path: string): Promise<string[]> {
    const segs = this.segments(path);
    const dir = segs.length === 0 ? this.root : await this.resolveDir(segs);
    const names: string[] = [];
    for await (const entry of dir.values()) {
      names.push(entry.name);
    }
    return names;
  }

  async deleteFile(path: string): Promise<void> {
    const segs = this.segments(path);
    const filename = segs[segs.length - 1];
    const dir = await this.resolveDir(segs.slice(0, -1));
    await dir.removeEntry(filename);
  }

  async rename(from: string, to: string): Promise<void> {
    const fromSegs = this.segments(from);
    const toSegs = this.segments(to);
    const fromFilename = fromSegs[fromSegs.length - 1];
    const toFilename = toSegs[toSegs.length - 1];
    const fromDir = await this.resolveDir(fromSegs.slice(0, -1), true);
    const toDir = await this.resolveDir(toSegs.slice(0, -1), true);
    const srcFh = await fromDir.getFileHandle(fromFilename);
    const bytes = new Uint8Array(await (await srcFh.getFile()).arrayBuffer());
    const dstFh = await toDir.getFileHandle(toFilename, { create: true });
    const w = await dstFh.createWritable();
    await w.write(bytes);
    await w.close();
    await fromDir.removeEntry(fromFilename);
  }

  async downloadFile(url: string, destPath: string): Promise<void> {
    // credentials:'include' is needed for Blipfoto /download URLs which require
    // the session cookie. It is harmless for public CloudFront URLs.
    const signal = AbortSignal.timeout(60_000);
    const resp = await fetch(url, { credentials: 'include', signal });
    // Guard against non-OK responses — without this, a 404 or 429 (rate-limit) would
    // write the error body (or empty bytes) into the backup as if it were the image.
    if (!resp.ok) {
      throw new Error(`download failed: ${resp.status} ${resp.statusText} — ${url}`);
    }
    const bytes = new Uint8Array(await resp.arrayBuffer());
    await this.writeFile(destPath, bytes);
  }

  async fetchHtml(url: string): Promise<string> {
    // credentials:'include' sends the user's existing Blipfoto session cookies,
    // which can reasonably be assumed to be present in the browser context.
    const signal = AbortSignal.timeout(60_000);
    const resp = await fetch(url, { credentials: 'include', signal });
    if (!resp.ok) {
      throw new Error(`fetchHtml failed: ${resp.status} ${resp.statusText} — ${url}`);
    }
    return resp.text();
  }

  log(entry: LogEntry): void {
    debug.log(`[b-ark] ${entry.level} ${entry.message}`);
  }
}
