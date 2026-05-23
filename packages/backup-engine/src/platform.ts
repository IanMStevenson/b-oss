// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

export interface PlatformIO {
  readFile(path: string): Promise<Buffer>;
  writeFile(path: string, data: Buffer | string): Promise<void>;
  ensureDir(path: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  listDir(path: string): Promise<string[]>;
  deleteFile(path: string): Promise<void>;

  downloadFile(url: string, destPath: string): Promise<void>;

  log(entry: import('./types.js').LogEntry): void;
}
