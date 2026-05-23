// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import {
  BlipfotoError,
  NetworkError,
  type BlipfotoClient,
  type BlipComment as ApiBlipComment,
  type BlipEntryFull,
  type BlipEntryStub,
} from '@b-oss/blipfoto-api';
import { BackupAbortedError } from './errors.js';
import { CheckpointManager } from './checkpoint.js';
import { JournalIndex } from './journal-index.js';
import { LogManager } from './log-manager.js';
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
const DISCOVERY_PAGE_SIZE = 100;

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

  constructor(
    private readonly config: AccountBackupConfig,
    private readonly io: PlatformIO,
    private readonly client: BlipfotoClient,
    private readonly onEvent: (event: BackupEvent) => void,
  ) {}

  cancel(): void {
    this.cancelled = true;
  }

  async run(): Promise<void> {
    this.onEvent({ type: 'discovering', account_id: this.config.id });

    const journalFolder = joinPath(this.config.backup_folder, this.config.username);
    await this.io.ensureDir(journalFolder);

    const checkpointMgr = new CheckpointManager(this.io, journalFolder);
    const logMgr = new LogManager(this.io, journalFolder);
    const journalIndex = new JournalIndex(this.io, journalFolder);

    try {
      const existingIndex = await journalIndex.load();

      if (existingIndex === null) {
        await this.runFirstBackup(journalFolder, checkpointMgr, logMgr, journalIndex);
      } else {
        await checkpointMgr.clear();
        await this.runRoutineBackup(
          journalFolder,
          existingIndex,
          checkpointMgr,
          logMgr,
          journalIndex,
        );
      }
    } catch (err) {
      if (err instanceof BackupAbortedError) {
        this.onEvent({ type: 'failed', account_id: this.config.id, error: err.payload });
        this.io.log('error', `Backup failed: ${err.payload.kind}`, this.config.id);
      }
      throw err;
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
    logMgr: LogManager,
    journalIndex: JournalIndex,
  ): Promise<void> {
    const existing = await checkpointMgr.load();
    const checkpoint: BackupCheckpoint = existing ?? {
      started_at: nowIso(),
      phase: 'discovery',
      discovery_page_index: -1,
      discovered_entry_ids: [],
      fetched_entry_ids: [],
      total_to_fetch: 0,
    };

    const discoveredDates = new Map<string, string>();
    for (const id of checkpoint.discovered_entry_ids) {
      discoveredDates.set(id, '');
    }

    if (checkpoint.phase === 'discovery') {
      let pageIndex = checkpoint.discovery_page_index + 1;
      while (true) {
        this.checkCancelled();
        const page = await this.callApi(() =>
          this.client.getJournalEntries({
            username: this.config.username,
            pageIndex,
            pageSize: DISCOVERY_PAGE_SIZE,
          }),
        );
        for (const stub of page.entries) {
          if (!discoveredDates.has(stub.entry_id_str)) {
            checkpoint.discovered_entry_ids.push(stub.entry_id_str);
          }
          discoveredDates.set(stub.entry_id_str, stub.date);
        }
        checkpoint.discovery_page_index = pageIndex;
        await checkpointMgr.save(checkpoint);
        if (page.page.more === 0) break;
        pageIndex++;
      }

      checkpoint.phase = 'fetch';
      checkpoint.total_to_fetch = checkpoint.discovered_entry_ids.length;
      await checkpointMgr.save(checkpoint);
      await this.appendLog(logMgr, 'info', `Discovered ${checkpoint.total_to_fetch} entries`);
    }

    this.onEvent({
      type: 'started',
      account_id: this.config.id,
      total_to_fetch: checkpoint.total_to_fetch,
    });

    const fetchedSet = new Set(checkpoint.fetched_entry_ids);
    const fetchedEntries: BlipEntry[] = [];
    let consecutiveFailures = 0;

    for (const entryIdStr of checkpoint.discovered_entry_ids) {
      this.checkCancelled();
      if (fetchedSet.has(entryIdStr)) continue;

      let entry: BlipEntry;
      try {
        entry = await this.fetchAndWriteEntry(entryIdStr, journalFolder);
      } catch (err) {
        if (err instanceof BackupAbortedError) throw err;
        consecutiveFailures++;
        const message = err instanceof Error ? err.message : String(err);
        await this.appendLog(
          logMgr,
          'warn',
          `Failed to fetch entry ${entryIdStr}: ${message} (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`,
        );
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          await this.appendLog(
            logMgr,
            'warn',
            'Backup paused after 3 consecutive errors — will retry at next scheduled run',
          );
          const code = err instanceof BlipfotoError ? err.code : 0;
          throw new BackupAbortedError({ kind: 'api_error', code, message });
        }
        continue;
      }

      consecutiveFailures = 0;
      fetchedSet.add(entryIdStr);
      checkpoint.fetched_entry_ids.push(entryIdStr);
      fetchedEntries.push(entry);
      await checkpointMgr.save(checkpoint);

      this.onEvent({
        type: 'progress',
        account_id: this.config.id,
        done: fetchedSet.size,
        total: checkpoint.total_to_fetch,
        current_date: entry.date,
      });

      if (this.config.api_delay_ms > 0) {
        await sleep(this.config.api_delay_ms);
      }
    }

    const metadata: JournalMetadata = {
      schema_version: 1,
      username: this.config.username,
      journal_title: this.config.journal_title,
      avatar_url: this.config.avatar_url,
      entry_total: fetchedEntries.length,
      last_backup_at: nowIso(),
      entries: fetchedEntries.map((e) => JournalIndex.toEntryIndex(e)),
    };
    await journalIndex.save(metadata);
    await checkpointMgr.clear();
    await logMgr.trim(DEFAULT_LOG_TRIM_LINES);

    this.onEvent({
      type: 'completed',
      account_id: this.config.id,
      total_archived: fetchedEntries.length,
    });
    await this.appendLog(
      logMgr,
      'info',
      `First backup complete — ${fetchedEntries.length} entries archived`,
    );
  }

  private async runRoutineBackup(
    journalFolder: string,
    existing: JournalMetadata,
    _checkpointMgr: CheckpointManager,
    logMgr: LogManager,
    journalIndex: JournalIndex,
  ): Promise<void> {
    let journalTitle = existing.journal_title;
    let avatarUrl = existing.avatar_url;
    let entryTotal = existing.entry_total;

    try {
      const profile = await this.callApi(() =>
        this.client.getUserProfile({ username: this.config.username, returnDetails: true }),
      );
      avatarUrl = profile.user.avatar_url;
      if (profile.details) {
        journalTitle = profile.details.journal_title;
        entryTotal = profile.details.entry_total;
      }
    } catch (err) {
      if (err instanceof BackupAbortedError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      await this.appendLog(logMgr, 'warn', `Profile refresh failed: ${message}`);
    }

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
      try {
        const entry = await this.fetchAndWriteEntry(entryIdx.entry_id, journalFolder);
        indexByDate.set(entry.date, JournalIndex.toEntryIndex(entry));
        indexById.set(entry.entry_id, JournalIndex.toEntryIndex(entry));
        consecutiveFailures = 0;
        await this.appendLog(logMgr, 'info', `Re-fetched entry ${entry.date}`);
      } catch (err) {
        if (err instanceof BackupAbortedError) throw err;
        consecutiveFailures++;
        const message = err instanceof Error ? err.message : String(err);
        await this.appendLog(logMgr, 'warn', `Failed to re-fetch ${entryIdx.entry_id}: ${message}`);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          await this.appendLog(
            logMgr,
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
      });
      if (this.config.api_delay_ms > 0) {
        await sleep(this.config.api_delay_ms);
      }
    }

    const recentDates = new Set(lastNDates(this.config.gap_check_days));
    const todayStr = todayYmd();
    let recentStubs: BlipEntryStub[] = [];
    try {
      const page = await this.callApi(() =>
        this.client.getJournalEntries({
          username: this.config.username,
          pageIndex: 0,
          pageSize: DISCOVERY_PAGE_SIZE,
        }),
      );
      recentStubs = page.entries;
    } catch (err) {
      if (err instanceof BackupAbortedError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      await this.appendLog(logMgr, 'warn', `Gap-fill discovery failed: ${message}`);
    }

    for (const stub of recentStubs) {
      if (!recentDates.has(stub.date)) continue;
      if (stub.date > todayStr) continue;
      if (indexByDate.has(stub.date)) continue;
      if (indexById.has(stub.entry_id_str)) continue;

      this.checkCancelled();
      try {
        const entry = await this.fetchAndWriteEntry(stub.entry_id_str, journalFolder);
        indexByDate.set(entry.date, JournalIndex.toEntryIndex(entry));
        indexById.set(entry.entry_id, JournalIndex.toEntryIndex(entry));
        await this.appendLog(logMgr, 'info', `Gap-filled entry ${entry.date}`);
        consecutiveFailures = 0;
      } catch (err) {
        if (err instanceof BackupAbortedError) throw err;
        consecutiveFailures++;
        const message = err instanceof Error ? err.message : String(err);
        await this.appendLog(logMgr, 'warn', `Failed to gap-fill ${stub.entry_id_str}: ${message}`);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          await this.appendLog(
            logMgr,
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
      try {
        const entry = await this.fetchAndWriteEntry(entryIdx.entry_id, journalFolder);
        indexByDate.set(entry.date, JournalIndex.toEntryIndex(entry));
        indexById.set(entry.entry_id, JournalIndex.toEntryIndex(entry));
        await this.appendLog(logMgr, 'warn', `Repaired missing image for ${entry.date}`);
        consecutiveFailures = 0;
      } catch (err) {
        if (err instanceof BackupAbortedError) throw err;
        consecutiveFailures++;
        const message = err instanceof Error ? err.message : String(err);
        await this.appendLog(
          logMgr,
          'warn',
          `Failed to repair image for ${entryIdx.date}: ${message}`,
        );
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          await this.appendLog(
            logMgr,
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
    await logMgr.trim(DEFAULT_LOG_TRIM_LINES);

    this.onEvent({
      type: 'completed',
      account_id: this.config.id,
      total_archived: metadata.entries.length,
    });
    await this.appendLog(
      logMgr,
      'info',
      `Routine backup complete — ${metadata.entries.length} entries indexed`,
    );
  }

  private async fetchAndWriteEntry(entryIdStr: string, journalFolder: string): Promise<BlipEntry> {
    const response = await this.callApi(() =>
      this.client.getEntry(entryIdStr, {
        returnDetails: true,
        returnMetadata: true,
        returnComments: true,
        includeReplies: true,
        returnImageUrls: true,
      }),
    );

    const entry = this.mapToBlipEntry(response.entry);

    const jsonRel = JournalIndex.entryJsonPath(entry.date);
    const imageRel = JournalIndex.entryImagePath(entry.date);
    const thumbRel = JournalIndex.entryThumbnailPath(entry.date);
    const jsonAbs = joinPath(journalFolder, jsonRel);
    const imageAbs = joinPath(journalFolder, imageRel);
    const thumbAbs = joinPath(journalFolder, thumbRel);
    const jsonDir = joinPath(journalFolder, `entries/${entry.date.slice(0, 4)}`);

    let finalJsonRel = jsonRel;
    let finalImageRel = imageRel;
    let finalThumbRel = thumbRel;
    let finalJsonAbs = jsonAbs;
    let finalImageAbs = imageAbs;
    let finalThumbAbs = thumbAbs;

    if (await this.io.fileExists(jsonAbs)) {
      try {
        const existingBuf = await this.io.readFile(jsonAbs);
        const existing = JSON.parse(existingBuf.toString()) as Partial<BlipEntry>;
        if (existing.entry_id && existing.entry_id !== entry.entry_id) {
          this.io.log(
            'warn',
            `Collision at ${jsonAbs} — existing entry_id ${existing.entry_id}, new ${entry.entry_id}; appending id suffix`,
            this.config.id,
          );
          const year = entry.date.slice(0, 4);
          finalJsonRel = `entries/${year}/${entry.date}-${entry.entry_id}.json`;
          finalImageRel = `entries/${year}/${entry.date}-${entry.entry_id}.jpg`;
          finalThumbRel = `entries/${year}/${entry.date}-${entry.entry_id}-t.jpg`;
          finalJsonAbs = joinPath(journalFolder, finalJsonRel);
          finalImageAbs = joinPath(journalFolder, finalImageRel);
          finalThumbAbs = joinPath(journalFolder, finalThumbRel);
        }
      } catch {
        // unreadable existing file — overwrite
      }
    }

    await this.io.ensureDir(jsonDir);

    const full = response.entry;
    if (full.image_urls?.original) {
      entry.images.original = finalImageRel;
    }
    if (full.image_urls?.lores ?? full.thumbnail_url) {
      entry.images.thumbnail = finalThumbRel;
    }

    const serialised = JSON.stringify(entry, null, 2);
    const tmpAbs = `${finalJsonAbs}.tmp`;
    await this.io.writeFile(tmpAbs, serialised);
    await this.io.writeFile(finalJsonAbs, serialised);
    if (await this.io.fileExists(tmpAbs)) {
      await this.io.deleteFile(tmpAbs);
    }

    if (full.image_urls?.original) {
      try {
        await this.io.downloadFile(full.image_urls.original, finalImageAbs);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.io.log(
          'warn',
          `Failed to download image for ${entry.date}: ${message}`,
          this.config.id,
        );
      }
    }

    const thumbUrl = full.image_urls?.lores ?? full.thumbnail_url;
    if (thumbUrl) {
      try {
        await this.io.downloadFile(thumbUrl, finalThumbAbs);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.io.log(
          'warn',
          `Failed to download thumbnail for ${entry.date}: ${message}`,
          this.config.id,
        );
      }
    }

    return entry;
  }

  private mapToBlipEntry(full: BlipEntryFull): BlipEntry {
    const exif = full.metadata
      ? {
          make: full.metadata.Make,
          model: full.metadata.Model,
          camera: full.metadata.camera,
          exposure_time: full.metadata.ExposureTime,
          f_number: full.metadata.FNumber,
          focal_length: full.metadata.FocalLength,
          iso: full.metadata.ISO,
        }
      : null;

    return {
      schema_version: 1,
      entry_id: full.entry_id_str,
      date: full.date,
      date_stamp: full.date_stamp,
      title: full.title,
      username: full.username,
      journal_title: full.details?.journal_title ?? this.config.journal_title,
      description: full.details?.description ?? '',
      description_html: full.details?.description_html ?? '',
      tags: full.details?.tags ?? [],
      location: full.location,
      views_total: full.details?.views.total ?? 0,
      stars_total: full.details?.stars.total ?? 0,
      favorites_total: full.details?.favorites.total ?? 0,
      comments: toBlipComments(full.comments?.list),
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
          this.onEvent({
            type: 'rate_limited',
            account_id: this.config.id,
            resume_in_seconds: waitSeconds,
          });
          this.io.log('info', `Rate limited — pausing ${waitSeconds}s`, this.config.id);
          await sleep(waitSeconds * 1000);
        } else {
          throw err;
        }
      }
    }
  }

  private async appendLog(
    logMgr: LogManager,
    level: 'info' | 'warn' | 'error',
    message: string,
  ): Promise<void> {
    const entry: LogEntry = {
      id: newId(),
      account_id: this.config.id,
      timestamp: nowIso(),
      level,
      message,
    };
    await logMgr.append(entry);
    this.io.log(level, message, this.config.id);
  }
}
