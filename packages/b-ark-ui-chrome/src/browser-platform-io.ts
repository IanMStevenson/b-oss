// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { PlatformIO, LogEntry } from '@b-oss/backup-engine';

export class BrowserPlatformIO implements PlatformIO {
  constructor(private readonly root: FileSystemDirectoryHandle) {}

  private segments(path: string): string[] {
    return path.split('/').filter((s) => s.length > 0);
  }

  private async resolveDir(segs: string[], create = false): Promise<FileSystemDirectoryHandle> {
    let dir = this.root;
    for (const seg of segs) {
      dir = await dir.getDirectoryHandle(seg, { create });
    }
    return dir;
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
    const resp = await fetch(url);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    await this.writeFile(destPath, bytes);
  }

  log(entry: LogEntry): void {
    console.log(`[b-ark] ${entry.level} ${entry.message}`);
  }
}
