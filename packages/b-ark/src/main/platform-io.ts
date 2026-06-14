// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import fs from 'node:fs/promises';
import type { PlatformIO, LogEntry } from '@b-oss/backup-engine';
import { net } from 'electron';

const TRANSIENT_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RETRY_DELAYS = [100, 200, 400, 800];

// On Windows, AV scanners and OneDrive briefly hold destination files open,
// causing rename to fail transiently. Retry with escalating backoff.
export async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      if (
        !TRANSIENT_CODES.has((err as NodeJS.ErrnoException).code ?? '') ||
        i >= RETRY_DELAYS.length
      )
        throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[i]));
    }
  }
}

type LogHandler = (entry: LogEntry) => void;

export class ElectronPlatformIO implements PlatformIO {
  private readonly logHandler: LogHandler;

  constructor(logHandler: LogHandler) {
    this.logHandler = logHandler;
  }

  async readFile(p: string): Promise<Uint8Array> {
    return fs.readFile(p);
  }

  async writeFile(p: string, data: Uint8Array | string): Promise<void> {
    await fs.writeFile(p, data);
  }

  async ensureDir(p: string): Promise<void> {
    await fs.mkdir(p, { recursive: true });
  }

  async fileExists(p: string): Promise<boolean> {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }

  async listDir(p: string): Promise<string[]> {
    try {
      return await fs.readdir(p);
    } catch {
      return [];
    }
  }

  async deleteFile(p: string): Promise<void> {
    await fs.unlink(p);
  }

  async atomicWrite(p: string, data: Uint8Array | string): Promise<void> {
    const tmp = `${p}.tmp`;
    await fs.writeFile(tmp, data);
    await renameWithRetry(tmp, p);
  }

  async rename(from: string, to: string): Promise<void> {
    await renameWithRetry(from, to);
  }

  async downloadFile(url: string, destPath: string): Promise<void> {
    const response = await net.fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed ${response.status}: ${url}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(destPath, buffer);
  }

  log(entry: LogEntry): void {
    this.logHandler(entry);
  }
}
