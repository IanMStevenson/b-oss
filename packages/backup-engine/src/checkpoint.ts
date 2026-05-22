// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { PlatformIO } from './platform.js';
import type { BackupCheckpoint } from './types.js';

const CHECKPOINT_FILENAME = '_checkpoint.json';
const CHECKPOINT_TMP_FILENAME = '_checkpoint.tmp';

export class CheckpointManager {
  private readonly path: string;
  private readonly tmpPath: string;

  constructor(
    private readonly io: PlatformIO,
    private readonly journalFolder: string,
  ) {
    this.path = `${this.journalFolder}/${CHECKPOINT_FILENAME}`;
    this.tmpPath = `${this.journalFolder}/${CHECKPOINT_TMP_FILENAME}`;
  }

  async load(): Promise<BackupCheckpoint | null> {
    const exists = await this.io.fileExists(this.path);
    if (!exists) return null;
    const buf = await this.io.readFile(this.path);
    return JSON.parse(buf.toString()) as BackupCheckpoint;
  }

  async save(checkpoint: BackupCheckpoint): Promise<void> {
    const serialised = JSON.stringify(checkpoint, null, 2);
    await this.io.writeFile(this.tmpPath, serialised);
    await this.io.writeFile(this.path, serialised);
    if (await this.io.fileExists(this.tmpPath)) {
      await this.io.deleteFile(this.tmpPath);
    }
  }

  async clear(): Promise<void> {
    if (await this.io.fileExists(this.path)) {
      await this.io.deleteFile(this.path);
    }
  }
}
