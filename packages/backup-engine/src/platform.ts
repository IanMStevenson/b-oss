// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

export interface PlatformIO {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array | string): Promise<void>;
  atomicWrite(path: string, data: Uint8Array | string): Promise<void>;
  /** Append to a file without reading/rewriting its existing content. Creates the file if missing. */
  appendFile(path: string, data: Uint8Array | string): Promise<void>;
  ensureDir(path: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  listDir(path: string): Promise<string[]>;
  deleteFile(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;

  downloadFile(url: string, destPath: string): Promise<void>;
  fetchHtml(url: string): Promise<string>;

  log(entry: import('./types.js').LogEntry): void;
}
