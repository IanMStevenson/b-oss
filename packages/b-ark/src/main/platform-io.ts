// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import fs from 'node:fs/promises';
import type { PlatformIO, LogEntry } from '@b-oss/backup-engine';
import { net } from 'electron';

type LogHandler = (entry: LogEntry) => void;

export class ElectronPlatformIO implements PlatformIO {
  private readonly logHandler: LogHandler;

  constructor(logHandler: LogHandler) {
    this.logHandler = logHandler;
  }

  async readFile(p: string): Promise<Buffer> {
    return fs.readFile(p);
  }

  async writeFile(p: string, data: Buffer | string): Promise<void> {
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
