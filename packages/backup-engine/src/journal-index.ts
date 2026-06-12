// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { PlatformIO } from './platform.js';
import type { BlipEntry, EntryIndex, JournalMetadata } from './types.js';

const JOURNAL_FILENAME = 'journal.json';
const JOURNAL_TMP_FILENAME = 'journal.tmp';
export const AVATAR_FILENAME = 'avatar.jpg';

/**
 * Best-effort write the user's avatar bytes to `<journalFolder>/avatar.jpg`
 * iff the file is not already there and `avatarUrl` is non-blank. Used as the
 * cache-write side of the avatar caching strategy: callers invoke this after
 * any API call that yields a `BlipUser.avatar_url`. Failures are swallowed
 * (network blip, missing folder permissions, etc.) — the next qualifying API
 * call will retry, and the UI falls back to the remote URL meanwhile.
 */
export async function cacheAvatarIfMissing(
  io: PlatformIO,
  journalFolder: string,
  avatarUrl: string,
): Promise<void> {
  if (!avatarUrl.trim()) return;
  const dest = `${journalFolder}/${AVATAR_FILENAME}`;
  if (await io.fileExists(dest)) return;
  try {
    await io.ensureDir(journalFolder);
    await io.downloadFile(avatarUrl, dest);
  } catch {
    // intentionally swallowed — see jsdoc
  }
}

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
    return JSON.parse(new TextDecoder().decode(buf)) as JournalMetadata;
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
    await this.io.rename(this.tmpPath, this.path);
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
