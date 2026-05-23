// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { PlatformIO } from './platform.js';
import type { BlipEntry, EntryIndex, JournalMetadata } from './types.js';

const JOURNAL_FILENAME = 'journal.json';
const JOURNAL_TMP_FILENAME = 'journal.tmp';

export class JournalIndex {
  private readonly path: string;
  private readonly tmpPath: string;

  constructor(
    private readonly io: PlatformIO,
    private readonly journalFolder: string,
  ) {
    this.path = `${this.journalFolder}/${JOURNAL_FILENAME}`;
    this.tmpPath = `${this.journalFolder}/${JOURNAL_TMP_FILENAME}`;
  }

  async load(): Promise<JournalMetadata | null> {
    const exists = await this.io.fileExists(this.path);
    if (!exists) return null;
    const buf = await this.io.readFile(this.path);
    return JSON.parse(buf.toString()) as JournalMetadata;
  }

  async save(metadata: JournalMetadata): Promise<void> {
    const sorted: JournalMetadata = {
      ...metadata,
      entries: [...metadata.entries].sort((a, b) =>
        a.date < b.date ? 1 : a.date > b.date ? -1 : 0,
      ),
    };
    const serialised = JSON.stringify(sorted, null, 2);
    await this.io.writeFile(this.tmpPath, serialised);
    await this.io.writeFile(this.path, serialised);
    if (await this.io.fileExists(this.tmpPath)) {
      await this.io.deleteFile(this.tmpPath);
    }
  }

  static toEntryIndex(entry: BlipEntry): EntryIndex {
    return {
      entry_id: entry.entry_id,
      date: entry.date,
      title: entry.title,
      thumbnail_path: JournalIndex.entryThumbnailPath(entry.date),
      json_path: JournalIndex.entryJsonPath(entry.date),
    };
  }

  static entryJsonPath(date: string): string {
    const year = date.slice(0, 4);
    return `entries/${year}/${date}.json`;
  }

  static entryImagePath(date: string): string {
    const year = date.slice(0, 4);
    return `entries/${year}/${date}.jpg`;
  }

  static entryThumbnailPath(date: string): string {
    const year = date.slice(0, 4);
    return `entries/${year}/${date}-t.jpg`;
  }

  static entryOriginalPath(date: string): string {
    const year = date.slice(0, 4);
    return `entries/${year}/${date}-o.jpg`;
  }

  static entryHiresPath(date: string): string {
    const year = date.slice(0, 4);
    return `entries/${year}/${date}-h.jpg`;
  }
}
