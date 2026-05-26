// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import {
  BlipfotoError,
  NetworkError,
  type BlipfotoClient,
  type BlipComment as ApiBlipComment,
  type BlipEntryStub,
  type EntryResponse,
} from '@b-oss/blipfoto-api';
import { BackupAbortedError } from './errors.js';
import { CheckpointManager } from './checkpoint.js';
import { JournalIndex, cacheAvatarIfMissing } from './journal-index.js';
import type { LogManager } from './log-manager.js';
import type { PlatformIO } from './platform.js';
import type {
  AccountBackupConfig,
  BackupCheckpoint,
  BackupEvent,
  BlipComment,
  BlipEntry,
  EntryIndex,
  JournalMetadata,
  LogEntry,
} from './types.js';

const MAX_CONSECUTIVE_FAILURES = 3;
const DEFAULT_LOG_TRIM_LINES = 5000;
const FETCH_PAGE_SIZE = 100;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function joinPath(...parts: string[]): string {
  return parts.join('/').replace(/\/+/g, '/');
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return globalThis.crypto.randomUUID();
}

function toBlipComments(list: ApiBlipComment[] | undefined): BlipComment[] {
  if (!list) return [];
  return list.map((c) => ({
    comment_id: c.comment_id_str,
    parent_id: c.parent_id_str,
    commenter_username: c.commenter.username,
    commenter_avatar_url: c.commenter.avatar_url,
    content: c.content,
    content_html: c.content_html,
    replies: toBlipComments(c.replies ?? undefined),
  }));
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function lastNDates(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export class BackupEngine {
  private cancelled = false;

  // Set for the duration of run(); used by appendLog and callWithRateLimitPause
  private runLogMgr: LogManager | null = null;
  private runBackupId: string | null = null;

  constructor(
    private readonly config: AccountBackupConfig,
    private readonly io: PlatformIO,
    private readonly client: BlipfotoClient,
    private readonly onEvent: (event: BackupEvent) => void,
    private readonly logMgr: LogManager,
  ) {}

  cancel(): void {
    this.cancelled = true;
  }

  async run(): Promise<void> {
    const journalFolder = joinPath(this.config.backup_folder, this.config.username);
    await this.io.ensureDir(journalFolder);

    const checkpointMgr = new CheckpointManager(this.io, journalFolder);
    const journalIndex = new JournalIndex(this.io, journalFolder);

    this.runLogMgr = this.logMgr;
    this.runBackupId = newId();

    try {
      const checkpoint = await checkpointMgr.load();
      const existingIndex = await journalIndex.load();

      if (checkpoint !== null || existingIndex === null) {
        await this.runFirstBackup(journalFolder, checkpointMgr, journalIndex);
      } else {
        await this.runRoutineBackup(journalFolder, existingIndex, checkpointMgr, journalIndex);
      }
    } catch (err) {
      if (err instanceof BackupAbortedError) {
        this.onEvent({ type: 'failed', account_id: this.config.id, error: err.payload });
        await this.appendLog('error', `Backup failed: ${err.payload.kind}`);
      }
      throw err;
    } finally {
      this.runLogMgr = null;
      this.runBackupId = null;
    }
  }

  private checkCancelled(): void {
    if (this.cancelled) {
      throw new BackupAbortedError({ kind: 'network' });
    }
  }

  private async runFirstBackup(
    journalFolder: string,
    checkpointMgr: CheckpointManager,
    journalIndex: JournalIndex,
  ): Promise<void> {
    const existing = await checkpointMgr.load();
    const checkpoint: BackupCheckpoint = existing ?? {
      started_at: nowIso(),
      last_page_index: 0,
      fetched_entry_ids: [],
      total_to_fetch: 0,
    };

    if (!existing) {
      try {
        await this.appendLog('info', 'API: getUserProfile (initialising)');
        const profile = await this.callApi(() =>
          this.client.getUserProfile({ username: this.config.username, returnDetails: true }),
        );
        checkpoint.total_to_fetch = profile.details?.entry_total ?? 0;
        await cacheAvatarIfMissing(this.io, journalFolder, profile.user.avatar_url);
      } catch (err) {
        if (err instanceof BackupAbortedError) throw err;
        const message = err instanceof Error ? err.message : String(err);
        await this.appendLog('warn', `Could not read entry_total: ${message}`);
      }
      await checkpointMgr.save(checkpoint);
    }

    await this.appendLog(
      'info',
      `First backup started — ${checkpoint.total_to_fetch} entries expected`,
    );

    this.onEvent({
      type: 'started',
      account_id: this.config.id,
      total_to_fetch: checkpoint.total_to_fetch,
    });

    const fetchedSet = new Set(checkpoint.fetched_entry_ids);
    const fetchedEntries: BlipEntry[] = [];
    let consecutiveFailures = 0;
    let pageIndex = checkpoint.last_page_index;

    // Load any entries already written in a prior interrupted run so that
    // incremental journal.json saves include the full picture, not just entries
    // fetched in this session.
    const priorIndex = await journalIndex.load();
    const priorEntryMap = new Map<string, EntryIndex>(
      priorIndex?.entries.map((e) => [e.entry_id, e]) ?? [],
    );

    while (true) {
      this.checkCancelled();
      await this.appendLog('info', `API: getJournalEntries page ${pageIndex} (initial fetch)`);
      const page = await this.callApi(() =>
        this.client.getJournalEntries({
          username: this.config.username,
          pageIndex,
          pageSize: FETCH_PAGE_SIZE,
        }),
      );

      for (const stub of page.entries) {
        this.checkCancelled();
        if (fetchedSet.has(stub.entry_id_str)) continue;

        let entry: BlipEntry;
        try {
          entry = await this.fetchAndWriteEntry(stub.entry_id_str, journalFolder);
        } catch (err) {
          if (err instanceof BackupAbortedError) throw err;
          consecutiveFailures++;
          const message = err instanceof Error ? err.message : String(err);
          await this.appendLog(
            'warn',
            `Failed to fetch entry ${stub.entry_id_str}: ${message} (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`,
          );
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            await this.appendLog(
              'warn',
              'Backup paused after 3 consecutive errors — will retry at next scheduled run',
            );
            const code = err instanceof BlipfotoError ? err.code : 0;
            throw new BackupAbortedError({ kind: 'api_error', code, message });
          }
          continue;
        }

        consecutiveFailures = 0;
        fetchedSet.add(stub.entry_id_str);
        checkpoint.fetched_entry_ids.push(stub.entry_id_str);
        fetchedEntries.push(entry);
        if (fetchedSet.size > checkpoint.total_to_fetch) {
          checkpoint.total_to_fetch = fetchedSet.size;
        }
        await checkpointMgr.save(checkpoint);

        const currentIds = new Set(fetchedEntries.map((e) => e.entry_id));
        const mergedEntries: EntryIndex[] = [
          ...fetchedEntries.map((e) => JournalIndex.toEntryIndex(e)),
          ...[...priorEntryMap.values()].filter((e) => !currentIds.has(e.entry_id)),
        ];
        await journalIndex.save({
          schema_version: 1,
          username: this.config.username,
          journal_title: this.config.journal_title,
          avatar_url: this.config.avatar_url,
          entry_total: mergedEntries.length,
          last_backup_at: nowIso(),
          entries: mergedEntries,
        });

        this.onEvent({
          type: 'progress',
          account_id: this.config.id,
          done: fetchedSet.size,
          total: checkpoint.total_to_fetch,
          current_date: entry.date,
          total_archived: mergedEntries.length,
        });

        if (this.config.api_delay_ms > 0) {
          await sleep(this.config.api_delay_ms);
        }
      }

      if (page.page.more === 0) break;
      pageIndex++;
      checkpoint.last_page_index = pageIndex;
      await checkpointMgr.save(checkpoint);
    }

    const finalCurrentIds = new Set(fetchedEntries.map((e) => e.entry_id));
    const finalEntries: EntryIndex[] = [
      ...fetchedEntries.map((e) => JournalIndex.toEntryIndex(e)),
      ...[...priorEntryMap.values()].filter((e) => !finalCurrentIds.has(e.entry_id)),
    ];
    const metadata: JournalMetadata = {
      schema_version: 1,
      username: this.config.username,
      journal_title: this.config.journal_title,
      avatar_url: this.config.avatar_url,
      entry_total: finalEntries.length,
      last_backup_at: nowIso(),
      entries: finalEntries,
    };
    await journalIndex.save(metadata);
    await checkpointMgr.clear();
    await this.runLogMgr!.trim(DEFAULT_LOG_TRIM_LINES);

    this.onEvent({
      type: 'completed',
      account_id: this.config.id,
      total_archived: finalEntries.length,
    });
    await this.appendLog(
      'info',
      `First backup complete — ${fetchedEntries.length} entries archived`,
    );
  }

  private async runRoutineBackup(
    journalFolder: string,
    existing: JournalMetadata,
    _checkpointMgr: CheckpointManager,
    journalIndex: JournalIndex,
  ): Promise<void> {
    let journalTitle = existing.journal_title;
    let avatarUrl = existing.avatar_url;
    let entryTotal = existing.entry_total;

    try {
      await this.appendLog('info', 'API: getUserProfile (refresh)');
      const profile = await this.callApi(() =>
        this.client.getUserProfile({ username: this.config.username, returnDetails: true }),
      );
      avatarUrl = profile.user.avatar_url;
      if (profile.details) {
        journalTitle = profile.details.journal_title;
        entryTotal = profile.details.entry_total;
      }
      await cacheAvatarIfMissing(this.io, journalFolder, avatarUrl);
    } catch (err) {
      if (err instanceof BackupAbortedError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      await this.appendLog('warn', `Profile refresh failed: ${message}`);
    }

    await this.appendLog('info', 'Routine backup started');

    this.onEvent({
      type: 'started',
      account_id: this.config.id,
      total_to_fetch: this.config.redo_count,
    });

    const indexByDate = new Map<string, EntryIndex>();
    for (const e of existing.entries) {
      indexByDate.set(e.date, e);
    }
    const indexById = new Map<string, EntryIndex>();
    for (const e of existing.entries) {
      indexById.set(e.entry_id, e);
    }

    let consecutiveFailures = 0;
    let done = 0;

    const toRedo = existing.entries.slice(0, this.config.redo_count);
    for (const entryIdx of toRedo) {
      this.checkCancelled();
      await this.appendLog('info', `Re-fetching entry ${entryIdx.date} (redo)`);
      try {
        const entry = await this.fetchAndWriteEntry(entryIdx.entry_id, journalFolder);
        indexByDate.set(entry.date, JournalIndex.toEntryIndex(entry));
        indexById.set(entry.entry_id, JournalIndex.toEntryIndex(entry));
        consecutiveFailures = 0;
        await this.appendLog('info', `Re-fetched entry ${entry.date}`);
      } catch (err) {
        if (err instanceof BackupAbortedError) throw err;
        consecutiveFailures++;
        const message = err instanceof Error ? err.message : String(err);
        await this.appendLog('warn', `Failed to re-fetch ${entryIdx.entry_id}: ${message}`);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          await this.appendLog(
            'warn',
            'Backup paused after 3 consecutive errors — will retry at next scheduled run',
          );
          const code = err instanceof BlipfotoError ? err.code : 0;
          throw new BackupAbortedError({ kind: 'api_error', code, message });
        }
      }
      done++;
      this.onEvent({
        type: 'progress',
        account_id: this.config.id,
        done,
        total: this.config.redo_count,
        current_date: entryIdx.date,
        total_archived: existing.entries.length,
      });
      if (this.config.api_delay_ms > 0) {
        await sleep(this.config.api_delay_ms);
      }
    }

    const recentDates = new Set(lastNDates(this.config.gap_check_days));
    const todayStr = todayYmd();
    const windowStart = [...recentDates].sort()[0];

    // Dates after the most recent archived entry are "not posted yet", not gaps.
    const mostRecentEntryDate = existing.entries[0]?.date ?? todayStr;

    // Only dates in the window that have no entry in the index AND are not
    // after the most recent post could be genuine gaps.
    const uncoveredDates = [...recentDates].filter(
      (d) => d <= mostRecentEntryDate && !indexByDate.has(d),
    );

    const recentStubs: BlipEntryStub[] = [];
    if (uncoveredDates.length === 0) {
      await this.appendLog('info', 'Gap-fill skipped — all dates in window are covered');
    } else {
      await this.appendLog(
        'info',
        `Gap-fill: ${uncoveredDates.length} uncovered date(s) in window — checking API`,
      );
      // Paginate until the oldest entry on the page predates the window start
      let pageIdx = 0;
      let keepPaging = true;
      while (keepPaging) {
        await this.appendLog('info', `API: getJournalEntries page ${pageIdx} (gap-fill discovery)`);
        let page;
        try {
          page = await this.callApi(() =>
            this.client.getJournalEntries({
              username: this.config.username,
              pageIndex: pageIdx,
              pageSize: FETCH_PAGE_SIZE,
            }),
          );
        } catch (err) {
          if (err instanceof BackupAbortedError) throw err;
          const message = err instanceof Error ? err.message : String(err);
          await this.appendLog('warn', `Gap-fill discovery failed: ${message}`);
          break;
        }
        for (const stub of page.entries) {
          if (stub.date >= windowStart && stub.date <= mostRecentEntryDate) {
            recentStubs.push(stub);
          }
        }
        const oldestOnPage = page.entries.at(-1);
        if (page.page.more === 0 || !oldestOnPage || oldestOnPage.date < windowStart) {
          keepPaging = false;
        } else {
          pageIdx++;
        }
      }
    }

    for (const stub of recentStubs) {
      if (indexByDate.has(stub.date)) continue;
      if (indexById.has(stub.entry_id_str)) continue;

      this.checkCancelled();
      await this.appendLog('info', `Fetching missing entry ${stub.date} (gap-fill)`);
      try {
        const entry = await this.fetchAndWriteEntry(stub.entry_id_str, journalFolder);
        indexByDate.set(entry.date, JournalIndex.toEntryIndex(entry));
        indexById.set(entry.entry_id, JournalIndex.toEntryIndex(entry));
        await this.appendLog('info', `Gap-filled entry ${entry.date}`);
        consecutiveFailures = 0;
      } catch (err) {
        if (err instanceof BackupAbortedError) throw err;
        consecutiveFailures++;
        const message = err instanceof Error ? err.message : String(err);
        await this.appendLog('warn', `Failed to gap-fill ${stub.entry_id_str}: ${message}`);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          await this.appendLog(
            'warn',
            'Backup paused after 3 consecutive errors — will retry at next scheduled run',
          );
          const code = err instanceof BlipfotoError ? err.code : 0;
          throw new BackupAbortedError({ kind: 'api_error', code, message });
        }
      }
    }

    for (const entryIdx of [...indexById.values()]) {
      this.checkCancelled();
      const imageRel = JournalIndex.entryImagePath(entryIdx.date);
      const imageAbs = joinPath(journalFolder, imageRel);
      const present = await this.io.fileExists(imageAbs);
      if (present) continue;
      await this.appendLog('info', `Re-fetching entry ${entryIdx.date} (image repair)`);
      try {
        const entry = await this.fetchAndWriteEntry(entryIdx.entry_id, journalFolder);
        indexByDate.set(entry.date, JournalIndex.toEntryIndex(entry));
        indexById.set(entry.entry_id, JournalIndex.toEntryIndex(entry));
        await this.appendLog('info', `Repaired missing image for ${entry.date}`);
        consecutiveFailures = 0;
      } catch (err) {
        if (err instanceof BackupAbortedError) throw err;
        consecutiveFailures++;
        const message = err instanceof Error ? err.message : String(err);
        await this.appendLog('warn', `Failed to repair image for ${entryIdx.date}: ${message}`);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          await this.appendLog(
            'warn',
            'Backup paused after 3 consecutive errors — will retry at next scheduled run',
          );
          const code = err instanceof BlipfotoError ? err.code : 0;
          throw new BackupAbortedError({ kind: 'api_error', code, message });
        }
      }
    }

    const metadata: JournalMetadata = {
      schema_version: 1,
      username: this.config.username,
      journal_title: journalTitle,
      avatar_url: avatarUrl,
      entry_total: entryTotal,
      last_backup_at: nowIso(),
      entries: [...indexByDate.values()],
    };
    await journalIndex.save(metadata);
    await this.runLogMgr!.trim(DEFAULT_LOG_TRIM_LINES);

    this.onEvent({
      type: 'completed',
      account_id: this.config.id,
      total_archived: metadata.entries.length,
    });
    await this.appendLog(
      'info',
      `Routine backup complete — ${metadata.entries.length} entries indexed`,
    );
  }

  private async fetchAndWriteEntry(entryIdStr: string, journalFolder: string): Promise<BlipEntry> {
    await this.appendLog('info', `API: getEntry ${entryIdStr}`);
    const response = await this.callApi(() =>
      this.client.getEntry(entryIdStr, {
        returnDetails: true,
        returnMetadata: true,
        returnComments: true,
        includeReplies: true,
        returnImageUrls: true,
      }),
    );

    const entry = this.mapToBlipEntry(response);

    const jsonRel = JournalIndex.entryJsonPath(entry.date);
    const imageRel = JournalIndex.entryImagePath(entry.date);
    const thumbRel = JournalIndex.entryThumbnailPath(entry.date);
    const originalRel = JournalIndex.entryOriginalPath(entry.date);
    const hiresRel = JournalIndex.entryHiresPath(entry.date);
    const jsonAbs = joinPath(journalFolder, jsonRel);
    const imageAbs = joinPath(journalFolder, imageRel);
    const thumbAbs = joinPath(journalFolder, thumbRel);
    const originalAbs = joinPath(journalFolder, originalRel);
    const hiresAbs = joinPath(journalFolder, hiresRel);
    const jsonDir = joinPath(journalFolder, `entries/${entry.date.slice(0, 4)}`);

    // If an entry for this date already exists on disk with a different
    // entry_id, the user has deleted-and-reposted: the new entry is the
    // canonical one. Overwrite in place; do not preserve the old version.
    if (await this.io.fileExists(jsonAbs)) {
      try {
        const existingBuf = await this.io.readFile(jsonAbs);
        const existing = JSON.parse(existingBuf.toString()) as Partial<BlipEntry>;
        if (existing.entry_id && existing.entry_id !== entry.entry_id) {
          await this.appendLog(
            'info',
            `Replacing entry for ${entry.date} — entry_id changed from ${existing.entry_id} to ${entry.entry_id}`,
          );
        }
      } catch {
        // unreadable existing file — overwrite
      }
    }

    await this.io.ensureDir(jsonDir);

    const downloads: Array<{
      label: string;
      url: string;
      destAbs: string;
      assign: () => void;
    }> = [];

    if (response.entry.thumbnail_url) {
      downloads.push({
        label: 'thumbnail',
        url: response.entry.thumbnail_url,
        destAbs: thumbAbs,
        assign: () => {
          entry.images.thumbnail = thumbRel;
        },
      });
    }
    if (response.entry.image_url) {
      downloads.push({
        label: 'image',
        url: response.entry.image_url,
        destAbs: imageAbs,
        assign: () => {
          entry.images.image = imageRel;
        },
      });
    }
    if (response.image_urls?.original) {
      downloads.push({
        label: 'original',
        url: response.image_urls.original,
        destAbs: originalAbs,
        assign: () => {
          entry.images.original = originalRel;
        },
      });
    }
    if (response.image_urls?.hires) {
      downloads.push({
        label: 'hires',
        url: response.image_urls.hires,
        destAbs: hiresAbs,
        assign: () => {
          entry.images.hires = hiresRel;
        },
      });
    }

    for (const dl of downloads) {
      try {
        await this.io.downloadFile(dl.url, dl.destAbs);
        dl.assign();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.appendLog(
          'warn',
          `Failed to download ${dl.label} for ${entry.date}: ${message}`,
        );
      }
    }

    const serialised = JSON.stringify(entry, null, 2);
    const tmpAbs = `${jsonAbs}.tmp`;
    await this.io.writeFile(tmpAbs, serialised);
    await this.io.rename(tmpAbs, jsonAbs);

    return entry;
  }

  private mapToBlipEntry(response: EntryResponse): BlipEntry {
    const { entry, details, metadata, comments } = response;
    const exif = metadata
      ? {
          make: metadata.Make,
          model: metadata.Model,
          camera: metadata.camera,
          exposure_time: metadata.ExposureTime,
          f_number: metadata.FNumber,
          focal_length: metadata.FocalLength,
          iso: metadata.ISO,
        }
      : null;

    return {
      schema_version: 1,
      entry_id: entry.entry_id_str,
      date: entry.date,
      date_stamp: entry.date_stamp,
      title: entry.title,
      username: entry.username,
      journal_title: details?.journal_title ?? this.config.journal_title,
      description: details?.description ?? '',
      description_html: details?.description_html ?? '',
      tags: details?.tags ?? [],
      location: entry.location,
      views_total: details?.views.total ?? 0,
      stars_total: details?.stars.total ?? 0,
      favorites_total: details?.favorites.total ?? 0,
      comments: toBlipComments(comments?.list),
      exif,
      images: {},
      backed_up_at: nowIso(),
      backup_app_version: this.config.app_version,
    };
  }

  private async callApi<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await this.callWithRateLimitPause(fn);
    } catch (err) {
      if (err instanceof BlipfotoError && err.isTokenInvalid) {
        throw new BackupAbortedError({ kind: 'auth_expired' });
      }
      if (err instanceof NetworkError) {
        throw new BackupAbortedError({ kind: 'network' });
      }
      throw err;
    }
  }

  private async callWithRateLimitPause<T>(fn: () => Promise<T>): Promise<T> {
    while (true) {
      try {
        return await fn();
      } catch (err) {
        if (err instanceof BlipfotoError && err.isRateLimited) {
          const waitSeconds = (this.client.rateLimitInfo?.resetInSeconds ?? 900) + 5;
          const resumeAt = new Date(Date.now() + waitSeconds * 1000).toISOString();
          this.onEvent({
            type: 'rate_limited',
            account_id: this.config.id,
            resume_in_seconds: waitSeconds,
          });
          await this.appendLog(
            'info',
            `Rate limited — pausing ${waitSeconds}s (available at ${resumeAt})`,
          );
          await sleep(waitSeconds * 1000);
        } else {
          throw err;
        }
      }
    }
  }

  private async appendLog(level: 'info' | 'warn' | 'error', message: string): Promise<void> {
    const entry: LogEntry = {
      id: newId(),
      backup_id: this.runBackupId ?? undefined,
      account_id: this.config.id,
      timestamp: nowIso(),
      level,
      message,
    };
    if (this.runLogMgr) {
      await this.runLogMgr.append(entry);
    }
    this.io.log(entry);
  }
}
