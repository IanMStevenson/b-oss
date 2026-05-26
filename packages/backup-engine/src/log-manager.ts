// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { PlatformIO } from './platform.js';
import type { LogEntry } from './types.js';

const LOG_FILENAME = '_log.ndjson';
const LOG_TMP_FILENAME = '_log.tmp';

export class LogManager {
  private readonly path: string;
  private readonly tmpPath: string;

  /**
   * `folder` is the directory the log file lives in. Historically this was a
   * per-journal folder; in the unified-log model it's the shared backup
   * folder. The class itself is agnostic — it just appends NDJSON entries
   * atomically to `{folder}/_log.ndjson`.
   */
  constructor(
    private readonly io: PlatformIO,
    folder: string,
  ) {
    this.path = `${folder}/${LOG_FILENAME}`;
    this.tmpPath = `${folder}/${LOG_TMP_FILENAME}`;
  }

  async append(entry: LogEntry): Promise<void> {
    try {
      const existing = await this.readAllRaw();
      const line = JSON.stringify(entry);
      const next = existing.length === 0 ? `${line}\n` : `${existing}${line}\n`;
      await this.io.writeFile(this.tmpPath, next);
      await this.io.rename(this.tmpPath, this.path);
    } catch {
      // Silently swallow — we cannot log a log failure without recursing
    }
  }

  async readAll(): Promise<LogEntry[]> {
    try {
      const raw = await this.readAllRaw();
      if (raw.length === 0) return [];
      return raw
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => JSON.parse(line) as LogEntry);
    } catch {
      return [];
    }
  }

  async trim(maxLines: number): Promise<void> {
    try {
      const entries = await this.readAll();
      if (entries.length <= maxLines) return;
      const kept = entries.slice(entries.length - maxLines);
      const next = kept.map((e) => JSON.stringify(e)).join('\n') + '\n';
      await this.io.writeFile(this.tmpPath, next);
      await this.io.rename(this.tmpPath, this.path);
    } catch {
      // Silently swallow
    }
  }

  private async readAllRaw(): Promise<string> {
    const exists = await this.io.fileExists(this.path);
    if (!exists) return '';
    const buf = await this.io.readFile(this.path);
    return buf.toString();
  }
}
