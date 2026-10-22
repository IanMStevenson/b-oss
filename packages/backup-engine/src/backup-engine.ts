// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import {
  BlipfotoError,
  NetworkError,
  type BlipfotoClient,
  type BlipComment as ApiBlipComment,
  type BlipEntryStub,
  type EntryResponse,
} from '@b-oss/b-api';
import {
  BackupAbortedError,
  BackupCancelledError,
  classifyFetchFailure,
  countOutstanding,
  isTransientFailure,
  isUnfetchable,
  type OutstandingCounts,
} from './errors.js';
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
  ImageRepairState,
  JournalMetadata,
  LogEntry,
  PendingEntry,
  PendingFailureKind,
} from './types.js';

const MAX_CONSECUTIVE_FAILURES = 3;
const DEFAULT_LOG_TRIM_LINES = 5000;
const FETCH_PAGE_SIZE = 100;
// Pauses between in-run attempts at one entry that failed without a definite answer from the server.
const DEFAULT_RETRY_BACKOFF_MS = [1000, 4000];

const BLIPFOTO_SITE = 'https://www.blipfoto.com';
const GALLERY_MARKER = 'blipfoto.data.gallery = ';

export interface GalleryImageUrls {
  stdres?: string;
  hires?: string;
  original?: string;
}

export interface GalleryItem {
  item_id_str: string;
  thumbnail_url?: string;
  image_urls?: GalleryImageUrls;
}

/**
 * Pull the `blipfoto.data.gallery = {…}` JSON blob out of a rendered Blipfoto
 * entry page. Server-rendered today; a string scan (not a DOM parse) keeps this
 * usable from any platform. Returns `gallery.items` or `null` when the marker is
 * absent / the JSON is unbalanced or unparseable. Exported for direct unit
 * testing — production callers go through `BackupEngine.fetchGalleryData`.
 */
export function extractGalleryItems(html: string): GalleryItem[] | null {
  const start = html.indexOf(GALLERY_MARKER);
  if (start === -1) return null;
  const jsonStart = start + GALLERY_MARKER.length;
  // The JSON object ends at the first semicolon after a closing brace at the top level.
  // Walk forward tracking brace depth to find the end.
  let depth = 0;
  let end = -1;
  for (let i = jsonStart; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) return null;
  try {
    const gallery = JSON.parse(html.slice(jsonStart, end)) as { items?: GalleryItem[] };
    return gallery.items ?? null;
  } catch {
    return null;
  }
}

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

type FetchOutcome =
  | { status: 'ok'; entry: BlipEntry }
  | { status: 'gone' }
  | { status: 'failed'; error: unknown; kind: PendingFailureKind };

/** What the pending-retry and reconcile phases need to know about, and add to, the archive. */
interface ArchiveView {
  has(entryId: string): boolean;
  size(): number;
  add(entry: BlipEntry): void;
}

export interface BackupEngineOptions {
  /** Pauses between in-run attempts at a failing entry; one retry per element. */
  retryBackoffMs?: number[];
}

export class BackupEngine {
  private cancelled = false;
  private _sinceLastFlush = 0;

  // Set for the duration of run(); used by appendLog and callWithRateLimitPause
  private runLogMgr: LogManager | null = null;
  private runBackupId: string | null = null;

  // Set whenever any image/scrape download fails anywhere this run (not just inside the
  // repair pass) — used to decide whether it's safe to persist image_repair_complete. See
  // b-oss#85: a routine redo/gap-fill/new-posts run can otherwise "succeed" while silently
  // leaving a fresh entry with a missing image, since per-download failures there are only
  // warn-logged, not surfaced to the caller.
  private hadImageGap = false;

  // Entries the journal lists (or counts) that aren't archived, keyed by entry id. Loaded from
  // journal.json at the start of a run and written back with every journal save.
  private pending = new Map<string, PendingEntry>();
  private reconcileUnexplained: number | undefined;
  // Ids that already failed during this run, so the pending-retry phase doesn't repeat them.
  private attemptedThisRun = new Set<string>();
  private readonly retryBackoffMs: number[];

  constructor(
    private readonly config: AccountBackupConfig,
    private readonly io: PlatformIO,
    private readonly client: BlipfotoClient,
    private readonly onEvent: (event: BackupEvent) => void,
    private readonly logMgr: LogManager,
    options: BackupEngineOptions = {},
  ) {
    this.retryBackoffMs = options.retryBackoffMs ?? DEFAULT_RETRY_BACKOFF_MS;
  }

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
    this.hadImageGap = false;
    this.attemptedThisRun = new Set();

    try {
      const checkpoint = await checkpointMgr.load();
      const existingIndex = await journalIndex.load();
      this.pending = new Map((existingIndex?.pending_entries ?? []).map((p) => [p.entry_id, p]));
      this.reconcileUnexplained = existingIndex?.reconcile?.unexplained;

      if (checkpoint !== null || existingIndex === null) {
        await this.runFirstBackup(journalFolder, checkpointMgr, journalIndex);
      } else {
        await this.runRoutineBackup(journalFolder, existingIndex, checkpointMgr, journalIndex);
      }
    } catch (err) {
      if (err instanceof BackupCancelledError) {
        this.onEvent({ type: 'cancelled', account_id: this.config.id });
        await this.appendLog('info', 'Backup stopped by user');
      } else if (err instanceof BackupAbortedError) {
        this.onEvent({ type: 'failed', account_id: this.config.id, error: err.payload });
        await this.appendLog('error', `Backup failed: ${err.payload.kind}`);
      } else {
        // Any other error type must still terminate the run with an event — callers rely on
        // completed/cancelled/failed always firing exactly once to clear progress/RAG state.
        const message = err instanceof Error ? err.message : String(err);
        this.onEvent({
          type: 'failed',
          account_id: this.config.id,
          error: { kind: 'unexpected', message },
        });
        await this.appendLog('error', `Backup failed unexpectedly: ${message}`);
      }
      throw err;
    } finally {
      this.runLogMgr = null;
      this.runBackupId = null;
    }
  }

  private shouldFlushMetadata(): boolean {
    const interval = this.config.metadata_write_interval;
    if (interval <= 1) return true;
    this._sinceLastFlush = (this._sinceLastFlush + 1) % interval;
    return this._sinceLastFlush === 0;
  }

  private checkCancelled(): void {
    if (this.cancelled) {
      throw new BackupCancelledError();
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
    // The profile's entry count, when this run read it (not on a resumed run).
    let serverTotal: number | undefined;

    if (!existing) {
      try {
        await this.appendLog('info', 'API: getUserProfile (initialising)');
        const profile = await this.callApi(() =>
          this.client.getUserProfile({ username: this.config.username, returnDetails: true }),
        );
        serverTotal = profile.details?.entry_total;
        checkpoint.total_to_fetch = serverTotal ?? 0;
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
      kind: 'first',
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

    const mergedEntries = (): EntryIndex[] => {
      const currentIds = new Set(fetchedEntries.map((e) => e.entry_id));
      return [
        ...fetchedEntries.map((e) => JournalIndex.toEntryIndex(e)),
        ...[...priorEntryMap.values()].filter((e) => !currentIds.has(e.entry_id)),
      ];
    };
    const persist = async (): Promise<void> => {
      const entries = mergedEntries();
      await checkpointMgr.save(checkpoint);
      await journalIndex.save({
        schema_version: 1,
        username: this.config.username,
        journal_title: this.config.journal_title,
        avatar_url: this.config.avatar_url,
        entry_total: entries.length,
        last_backup_at: nowIso(),
        entries,
        ...this.pendingFields(),
      });
    };

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

        const outcome = await this.fetchTracked(stub, journalFolder, persist);
        if (outcome.status === 'gone') continue;
        if (outcome.status === 'failed') {
          consecutiveFailures++;
          await this.abortIfTooManyFailures(consecutiveFailures, outcome);
          continue;
        }
        const entry = outcome.entry;

        consecutiveFailures = 0;
        fetchedSet.add(stub.entry_id_str);
        checkpoint.fetched_entry_ids.push(stub.entry_id_str);
        fetchedEntries.push(entry);
        if (fetchedSet.size > checkpoint.total_to_fetch) {
          checkpoint.total_to_fetch = fetchedSet.size;
        }
        const archived = mergedEntries().length;
        if (this.shouldFlushMetadata()) await persist();

        this.onEvent({
          type: 'progress',
          account_id: this.config.id,
          done: fetchedSet.size,
          total: checkpoint.total_to_fetch,
          current_date: entry.date,
          total_archived: archived,
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

    // Anything the journal counts that isn't archived or already known to be failing is found
    // and fetched here; entries that failed during the pass above are left for the next run.
    const archivedIds = new Set(mergedEntries().map((e) => e.entry_id));
    const archive: ArchiveView = {
      has: (id) => archivedIds.has(id),
      size: () => archivedIds.size,
      add: (entry) => {
        archivedIds.add(entry.entry_id);
        fetchedEntries.push(entry);
      },
    };
    await this.reconcile(serverTotal, archive, persist);
    await this.retryPending(journalFolder, archive, persist);

    const finalEntries = mergedEntries();
    const metadata: JournalMetadata = {
      schema_version: 1,
      username: this.config.username,
      journal_title: this.config.journal_title,
      avatar_url: this.config.avatar_url,
      entry_total: Math.max(serverTotal ?? 0, finalEntries.length),
      last_backup_at: nowIso(),
      entries: finalEntries,
      // Every entry above went through fetchAndWriteEntry(), which already attempts the
      // scrape too — so a first backup with no gaps is already fully repaired, and the
      // very next routine run can skip the repair pass entirely. See b-oss#85.
      image_repair_complete: this.hadImageGap
        ? undefined
        : {
            enable_web_scrape: this.config.enable_web_scrape,
            download_hires: this.config.download_hires,
          },
      ...this.pendingFields(),
    };
    await journalIndex.save(metadata);
    await checkpointMgr.clear();
    await this.runLogMgr!.trim(DEFAULT_LOG_TRIM_LINES);

    this.onEvent({
      type: 'completed',
      account_id: this.config.id,
      total_archived: finalEntries.length,
      ...this.outstandingField(),
    });
    await this.appendLog(
      'info',
      `First backup complete — ${fetchedEntries.length} entries archived` +
        (this.pending.size > 0 ? `, ${this.pending.size} still pending` : ''),
    );
  }

  private outstandingField(): { outstanding?: OutstandingCounts } {
    const counts = countOutstanding([...this.pending.values()]);
    return counts ? { outstanding: counts } : {};
  }

  /** Optional journal.json fields for the pending list and reconcile state; absent when empty. */
  private pendingFields(): Pick<JournalMetadata, 'pending_entries' | 'reconcile'> {
    return {
      ...(this.pending.size > 0 ? { pending_entries: [...this.pending.values()] } : {}),
      ...(this.reconcileUnexplained !== undefined
        ? { reconcile: { unexplained: this.reconcileUnexplained } }
        : {}),
    };
  }

  /**
   * Fetch and write one entry. A failure with no definite answer from the server is retried
   * after short pauses; one that still fails is recorded as pending (and persisted at once) so a
   * later run can fetch it by id. A "no such entry" answer drops any pending record instead.
   * Cancellation and auth failures propagate.
   */
  private async fetchTracked(
    stub: { entry_id_str: string; date: string },
    journalFolder: string,
    persist: () => Promise<void>,
  ): Promise<FetchOutcome> {
    const id = stub.entry_id_str;
    let error: unknown;
    for (let attempt = 0; ; attempt++) {
      this.checkCancelled();
      try {
        const entry = await this.fetchAndWriteEntry(id, journalFolder);
        this.pending.delete(id);
        return { status: 'ok', entry };
      } catch (err) {
        if (err instanceof BackupCancelledError) throw err;
        if (err instanceof BackupAbortedError && err.payload.kind !== 'network') throw err;
        error = err;
        if (classifyFetchFailure(err) === 'gone') {
          await this.appendLog('info', `Entry ${id} (${stub.date}) no longer exists — dropped`);
          if (this.pending.delete(id)) await persist();
          return { status: 'gone' };
        }
        const pause = this.retryBackoffMs[attempt];
        if (pause === undefined || !isTransientFailure(err)) break;
        const message = err instanceof Error ? err.message : String(err);
        await this.appendLog(
          'warn',
          `Entry ${id} (${stub.date}) failed: ${message} — retrying in ${pause}ms`,
        );
        await sleep(pause);
      }
    }

    const kind = classifyFetchFailure(error) as PendingFailureKind;
    const message = error instanceof Error ? error.message : String(error);
    const now = nowIso();
    this.pending.set(id, {
      entry_id: id,
      date: stub.date,
      first_failed_at: this.pending.get(id)?.first_failed_at ?? now,
      last_attempt_at: now,
      last_error: { kind, message },
    });
    this.attemptedThisRun.add(id);
    await this.appendLog(
      'warn',
      `Failed to fetch entry ${id} (${stub.date}): ${message} [${kind}]`,
    );
    await persist();
    return { status: 'failed', error, kind };
  }

  private async abortIfTooManyFailures(
    consecutiveFailures: number,
    outcome: Extract<FetchOutcome, { status: 'failed' }>,
  ): Promise<void> {
    if (consecutiveFailures < MAX_CONSECUTIVE_FAILURES) return;
    await this.appendLog(
      'warn',
      'Backup paused after 3 consecutive errors — will retry at next scheduled run',
    );
    if (outcome.kind === 'network') throw new BackupAbortedError({ kind: 'network' });
    const code = outcome.error instanceof BlipfotoError ? outcome.error.code : 0;
    const message = outcome.error instanceof Error ? outcome.error.message : String(outcome.error);
    throw new BackupAbortedError({ kind: 'api_error', code, message });
  }

  /**
   * Retry each pending entry by id (no paging). Entries that failed earlier in this run, or have
   * been failing for longer than the give-up window, are skipped. Stops quietly after three
   * consecutive failures that aren't "unavailable" — the network is probably down.
   */
  private async retryPending(
    journalFolder: string,
    archive: ArchiveView,
    persist: () => Promise<void>,
  ): Promise<void> {
    const todo = [...this.pending.values()]
      .filter((p) => !this.attemptedThisRun.has(p.entry_id) && !isUnfetchable(p))
      .sort((a, b) => a.date.localeCompare(b.date));
    let consecutiveFailures = 0;
    for (const p of todo) {
      this.checkCancelled();
      await this.appendLog('info', `Retrying pending entry ${p.date}`);
      const outcome = await this.fetchTracked(
        { entry_id_str: p.entry_id, date: p.date },
        journalFolder,
        persist,
      );
      if (outcome.status === 'ok') {
        archive.add(outcome.entry);
        consecutiveFailures = 0;
        await this.appendLog('info', `Fetched pending entry ${outcome.entry.date}`);
        await persist();
      } else if (outcome.status === 'failed' && outcome.kind !== 'unavailable') {
        if (++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          await this.appendLog('warn', 'Pending retries stopped after 3 consecutive errors');
          return;
        }
      }
      if (this.config.api_delay_ms > 0) {
        await sleep(this.config.api_delay_ms);
      }
    }
  }

  /**
   * If the journal's entry count exceeds what is archived plus pending, something is missing that
   * we have no record of (for example a first backup from before failures were recorded). Page
   * the full listing (stubs only) and add every unarchived id to pending. The result is
   * remembered so a mismatch the listing can't explain isn't re-listed on every run.
   */
  private async reconcile(
    serverTotal: number | undefined,
    archive: ArchiveView,
    persist: () => Promise<void>,
  ): Promise<void> {
    if (serverTotal === undefined) return;
    const unexplained = serverTotal - archive.size() - this.pending.size;
    if (unexplained <= 0 || unexplained === this.reconcileUnexplained) return;

    await this.appendLog(
      'info',
      `Reconcile: ${unexplained} entries counted by the journal are not archived — listing journal`,
    );
    const listed: BlipEntryStub[] = [];
    for (let pageIdx = 0; ; pageIdx++) {
      this.checkCancelled();
      await this.appendLog('info', `API: getJournalEntries page ${pageIdx} (reconcile)`);
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
        await this.appendLog('warn', `Reconcile listing failed: ${message}`);
        return;
      }
      listed.push(...page.entries);
      if (page.page.more === 0) break;
      if (this.config.api_delay_ms > 0) await sleep(this.config.api_delay_ms);
    }

    const now = nowIso();
    let found = 0;
    for (const stub of listed) {
      if (archive.has(stub.entry_id_str) || this.pending.has(stub.entry_id_str)) continue;
      this.pending.set(stub.entry_id_str, {
        entry_id: stub.entry_id_str,
        date: stub.date,
        first_failed_at: now,
        last_attempt_at: now,
        last_error: { kind: 'other', message: 'Listed by the journal but not archived' },
      });
      found++;
    }
    this.reconcileUnexplained = serverTotal - archive.size() - this.pending.size;
    await this.appendLog(
      'info',
      `Reconcile: ${listed.length} entries listed, ${found} not archived` +
        (this.reconcileUnexplained > 0
          ? `; ${this.reconcileUnexplained} counted but not listed`
          : ''),
    );
    await persist();
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
      kind: 'routine',
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

    // Save journal.json incrementally after each entry change so the embedded
    // viewer's polling picks up updates as the backup progresses, mirroring
    // the first-backup save cadence.
    const saveSnapshot = async (force = false): Promise<void> => {
      if (!force && !this.shouldFlushMetadata()) return;
      await journalIndex.save({
        schema_version: 1,
        username: this.config.username,
        journal_title: journalTitle,
        avatar_url: avatarUrl,
        entry_total: entryTotal,
        last_backup_at: nowIso(),
        entries: [...indexByDate.values()],
        ...this.pendingFields(),
      });
    };

    // Dates after the most recent archived entry are "not posted yet", not gaps. Computed
    // once, up front, since both new-posts and gap-fill discovery need it.
    const recentDates = new Set(lastNDates(this.config.gap_check_days));
    const todayStr = todayYmd();
    const windowStart = [...recentDates].sort()[0];
    const mostRecentEntryDate = existing.entries[0]?.date ?? todayStr;

    // New posts run first — this is the content the user most cares about and is most likely
    // to be actively watching for (e.g. right after a publish-triggered backup). Redo and
    // gap-fill run after, so that if either of them later hits enough consecutive failures to
    // abort the whole run, the newest content has already been captured and saved. See
    // b-oss#86 — there's no correctness dependency forcing any particular order between the
    // three phases.
    const newStubs: BlipEntryStub[] = [];
    if (existing.entries.length > 0) {
      let newPageIdx = 0;
      let keepPagingNew = true;
      while (keepPagingNew) {
        await this.appendLog(
          'info',
          `API: getJournalEntries page ${newPageIdx} (new-posts discovery)`,
        );
        let page;
        try {
          page = await this.callApi(() =>
            this.client.getJournalEntries({
              username: this.config.username,
              pageIndex: newPageIdx,
              pageSize: FETCH_PAGE_SIZE,
            }),
          );
        } catch (err) {
          if (err instanceof BackupAbortedError) throw err;
          const message = err instanceof Error ? err.message : String(err);
          await this.appendLog('warn', `New-posts discovery failed: ${message}`);
          break;
        }
        for (const stub of page.entries) {
          if (stub.date > mostRecentEntryDate) {
            newStubs.push(stub);
          }
        }
        const oldestOnPage = page.entries.at(-1);
        if (page.page.more === 0 || !oldestOnPage || oldestOnPage.date <= mostRecentEntryDate) {
          keepPagingNew = false;
        } else {
          newPageIdx++;
        }
      }
      newStubs.sort((a, b) => a.date.localeCompare(b.date));
    }
    // Phase-entry emit for NEW (also fires on the empty-journal short-circuit
    // so the cell resolves consistently).
    this.onEvent({
      type: 'progress',
      account_id: this.config.id,
      done: 0,
      total: newStubs.length,
      current_date: '',
      total_archived: indexByDate.size,
      phase: 'new_posts',
    });
    let newPostsDone = 0;
    for (const stub of newStubs) {
      this.checkCancelled();
      await this.appendLog('info', `Fetching new entry ${stub.date}`);
      const outcome = await this.fetchTracked(stub, journalFolder, () => saveSnapshot(true));
      if (outcome.status === 'ok') {
        const entry = outcome.entry;
        indexByDate.set(entry.date, JournalIndex.toEntryIndex(entry));
        indexById.set(entry.entry_id, JournalIndex.toEntryIndex(entry));
        await this.appendLog('info', `Fetched new entry ${entry.date}`);
        consecutiveFailures = 0;
        await saveSnapshot(true);
      } else if (outcome.status === 'failed') {
        consecutiveFailures++;
        await this.abortIfTooManyFailures(consecutiveFailures, outcome);
      }
      newPostsDone++;
      this.onEvent({
        type: 'progress',
        account_id: this.config.id,
        done: newPostsDone,
        total: newStubs.length,
        current_date: stub.date,
        total_archived: indexByDate.size,
        phase: 'new_posts',
      });
      if (this.config.api_delay_ms > 0) {
        await sleep(this.config.api_delay_ms);
      }
    }

    // Entries the journal counts that we hold no record of are found by a full listing and
    // added to pending; pending entries (including those) are then retried by id.
    const archive: ArchiveView = {
      has: (id) => indexById.has(id),
      size: () => indexById.size,
      add: (entry) => {
        indexByDate.set(entry.date, JournalIndex.toEntryIndex(entry));
        indexById.set(entry.entry_id, JournalIndex.toEntryIndex(entry));
      },
    };
    await this.reconcile(entryTotal, archive, () => saveSnapshot(true));
    await this.retryPending(journalFolder, archive, () => saveSnapshot(true));

    // Only dates in the window that have no entry in the index AND are not
    // after the most recent post could be genuine gaps. A pending entry's date is
    // already being handled by the pending retry above.
    const pendingDates = new Set([...this.pending.values()].map((p) => p.date));
    const uncoveredDates = [...recentDates].filter(
      (d) => d <= mostRecentEntryDate && !indexByDate.has(d) && !pendingDates.has(d),
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

    const gapFillTodo = recentStubs.filter(
      (s) =>
        !indexByDate.has(s.date) &&
        !indexById.has(s.entry_id_str) &&
        !this.pending.has(s.entry_id_str),
    );
    // Phase-entry emit so the GAPS cell resolves even when there's nothing to fill.
    this.onEvent({
      type: 'progress',
      account_id: this.config.id,
      done: 0,
      total: gapFillTodo.length,
      current_date: '',
      total_archived: indexByDate.size,
      phase: 'gap_fill',
    });
    let gapFillDone = 0;
    for (const stub of gapFillTodo) {
      this.checkCancelled();
      await this.appendLog('info', `Fetching missing entry ${stub.date} (gap-fill)`);
      const outcome = await this.fetchTracked(stub, journalFolder, () => saveSnapshot(true));
      if (outcome.status === 'ok') {
        const entry = outcome.entry;
        indexByDate.set(entry.date, JournalIndex.toEntryIndex(entry));
        indexById.set(entry.entry_id, JournalIndex.toEntryIndex(entry));
        await this.appendLog('info', `Gap-filled entry ${entry.date}`);
        consecutiveFailures = 0;
        await saveSnapshot();
      } else if (outcome.status === 'failed') {
        consecutiveFailures++;
        await this.abortIfTooManyFailures(consecutiveFailures, outcome);
      }
      gapFillDone++;
      this.onEvent({
        type: 'progress',
        account_id: this.config.id,
        done: gapFillDone,
        total: gapFillTodo.length,
        current_date: stub.date,
        total_archived: indexByDate.size,
        phase: 'gap_fill',
      });
    }

    const toRedo = existing.entries.slice(0, this.config.redo_count);
    // Phase-entry emit so the REDO cell appears even when redo_count is 0.
    this.onEvent({
      type: 'progress',
      account_id: this.config.id,
      done: 0,
      total: this.config.redo_count,
      current_date: '',
      total_archived: existing.entries.length,
      phase: 'redo',
    });
    for (const entryIdx of toRedo) {
      this.checkCancelled();
      await this.appendLog('info', `Re-fetching entry ${entryIdx.date} (redo)`);
      try {
        const entry = await this.fetchAndWriteEntry(entryIdx.entry_id, journalFolder);
        indexByDate.set(entry.date, JournalIndex.toEntryIndex(entry));
        indexById.set(entry.entry_id, JournalIndex.toEntryIndex(entry));
        consecutiveFailures = 0;
        await this.appendLog('info', `Re-fetched entry ${entry.date}`);
        await saveSnapshot();
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
        phase: 'redo',
      });
      if (this.config.api_delay_ms > 0) {
        await sleep(this.config.api_delay_ms);
      }
    }

    // Image repair (standard image) + web-scrape backstop (original/hires/extras), merged
    // into one pass over every archived entry. Skipped entirely once a prior pass already
    // confirmed every entry has everything the *current* enable_web_scrape/download_hires
    // settings require, and nothing has gone wrong since (hadImageGap) — see b-oss#85.
    const repairSettings: ImageRepairState = {
      enable_web_scrape: this.config.enable_web_scrape,
      download_hires: this.config.download_hires,
    };
    const priorRepairState = existing.image_repair_complete;
    const skipRepair =
      priorRepairState !== undefined &&
      priorRepairState.enable_web_scrape === repairSettings.enable_web_scrape &&
      priorRepairState.download_hires === repairSettings.download_hires;

    if (skipRepair) {
      // Phase-entry emit so the FIX cell resolves even though nothing ran.
      this.onEvent({
        type: 'progress',
        account_id: this.config.id,
        done: 0,
        total: 0,
        current_date: '',
        total_archived: indexByDate.size,
        phase: 'image_repair',
      });
    } else {
      const repairTotal = indexById.size;
      this.onEvent({
        type: 'progress',
        account_id: this.config.id,
        done: 0,
        total: repairTotal,
        current_date: '',
        total_archived: indexByDate.size,
        phase: 'image_repair',
      });
      let repairChecked = 0;
      for (const entryIdx of [...indexById.values()]) {
        this.checkCancelled();
        const imageAbs = joinPath(journalFolder, JournalIndex.entryImagePath(entryIdx.date));
        const imagePresent = await this.io.fileExists(imageAbs);
        // Only entries that actually hit the network (a repair fetch or a scrape) pay the
        // api_delay_ms courtesy pause — the plain existence/JSON checks below are local disk
        // reads with nothing to be polite to the API about. Losing this distinction during
        // the image_repair/full_image_repair merge meant every entry paid the delay
        // regardless, turning a courtesy pause for real requests into ~6,800 sleeps on a
        // large archive (invisible on Chrome's default 0ms, ~28 minutes on Electron's 250ms).
        let didNetworkWork = false;

        if (!imagePresent) {
          didNetworkWork = true;
          await this.appendLog('info', `Re-fetching entry ${entryIdx.date} (image repair)`);
          try {
            const entry = await this.fetchAndWriteEntry(entryIdx.entry_id, journalFolder);
            indexByDate.set(entry.date, JournalIndex.toEntryIndex(entry));
            indexById.set(entry.entry_id, JournalIndex.toEntryIndex(entry));
            await this.appendLog('info', `Repaired missing image for ${entry.date}`);
            consecutiveFailures = 0;
            await saveSnapshot();
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
          // fetchAndWriteEntry() above already attempted the scrape too (if enabled), so
          // this entry doesn't need the scrape-only check below regardless of how it went.
        } else if (repairSettings.enable_web_scrape) {
          const jsonAbs = joinPath(journalFolder, entryIdx.json_path);
          let entry: BlipEntry | null = null;
          try {
            const buf = await this.io.readFile(jsonAbs);
            entry = JSON.parse(new TextDecoder().decode(buf)) as BlipEntry;
          } catch (err) {
            this.hadImageGap = true;
            const message = err instanceof Error ? err.message : String(err);
            await this.appendLog(
              'warn',
              `Could not read/parse entry JSON for ${entryIdx.date} during image repair: ${message}`,
            );
          }
          if (entry) {
            let needsScrape = !entry.images.web_scraped;
            if (!needsScrape) {
              const originalAbs = joinPath(
                journalFolder,
                JournalIndex.entryOriginalPath(entryIdx.date),
              );
              const missingMainOriginal =
                !entry.images.original && !(await this.io.fileExists(originalAbs));
              if (missingMainOriginal) {
                needsScrape = true;
              } else if (entry.images.extras) {
                for (const extra of entry.images.extras) {
                  if (!extra.original) {
                    const extraOrigAbs = joinPath(
                      journalFolder,
                      JournalIndex.extraOriginalPath(entryIdx.date, extra.item_id),
                    );
                    if (!(await this.io.fileExists(extraOrigAbs))) {
                      needsScrape = true;
                      break;
                    }
                  }
                }
              }
            }
            if (needsScrape) {
              didNetworkWork = true;
              await this.appendLog(
                'info',
                `Scraping full images for ${entryIdx.date} (image repair)`,
              );
              try {
                const items = await this.fetchGalleryData(entry.entry_id, entry.date);
                if (items) {
                  await this.fetchExtras(entry, journalFolder, items);
                }
                // Always write back so web_scraped:true is persisted — even when the page
                // had no extras or downloads failed. Without this, every run re-scrapes
                // all entries that downloaded nothing.
                const serialised = JSON.stringify(entry, null, 2);
                await this.io.atomicWrite(jsonAbs, serialised);
              } catch (err) {
                if (err instanceof BackupAbortedError) throw err;
                this.hadImageGap = true;
                const message = err instanceof Error ? err.message : String(err);
                await this.appendLog(
                  'warn',
                  `Image scrape failed for ${entryIdx.date}: ${message}`,
                );
              }
            }
          }
        }

        repairChecked++;
        this.onEvent({
          type: 'progress',
          account_id: this.config.id,
          done: repairChecked,
          total: repairTotal,
          current_date: entryIdx.date,
          total_archived: indexByDate.size,
          phase: 'image_repair',
        });
        if (didNetworkWork && this.config.api_delay_ms > 0) {
          await sleep(this.config.api_delay_ms);
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
      // Carries the repair pass's outcome forward regardless of whether it ran this time
      // (skipRepair) or ran clean just now — and drops it the moment anything (anywhere in
      // this run, not just the repair pass) left a gap, so the next run does a full pass.
      image_repair_complete: this.hadImageGap ? undefined : repairSettings,
      ...this.pendingFields(),
    };
    await journalIndex.save(metadata);
    await this.runLogMgr!.trim(DEFAULT_LOG_TRIM_LINES);

    this.onEvent({
      type: 'completed',
      account_id: this.config.id,
      total_archived: metadata.entries.length,
      ...this.outstandingField(),
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
        const existing = JSON.parse(new TextDecoder().decode(existingBuf)) as Partial<BlipEntry>;
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
        this.hadImageGap = true;
        const message = err instanceof Error ? err.message : String(err);
        await this.appendLog(
          'warn',
          `Failed to download ${dl.label} for ${entry.date}: ${message}`,
        );
      }
    }

    if (this.config.enable_web_scrape) {
      const items = await this.fetchGalleryData(entry.entry_id, entry.date);
      if (items) {
        await this.fetchExtras(entry, journalFolder, items);
      }
    }

    const serialised = JSON.stringify(entry, null, 2);
    await this.io.atomicWrite(jsonAbs, serialised);

    return entry;
  }

  private async fetchGalleryData(entryId: string, date: string): Promise<GalleryItem[] | null> {
    try {
      const url = `${BLIPFOTO_SITE}/entry/${entryId}`;
      await this.appendLog('info', `Scraping gallery data for ${date}`);
      const html = await this.io.fetchHtml(url);
      const items = extractGalleryItems(html);
      if (!items) {
        // The page fetched fine but has no gallery marker — confirmed live on a real,
        // large archive (b-oss#85) to be the normal, permanent state for plenty of
        // entries (simple single-image posts never emit it), not evidence of a scrape
        // failure. Treating this as a gap meant hadImageGap was ~always true on a real
        // account, so the completion flag could never actually be set. Don't flag it —
        // only a genuine fetch failure below (network error, non-OK response) counts.
        await this.appendLog('info', `No gallery marker for ${date} — nothing to scrape`);
      }
      return items;
    } catch (err) {
      this.hadImageGap = true;
      const message = err instanceof Error ? err.message : String(err);
      await this.appendLog('warn', `Could not fetch gallery HTML for ${date}: ${message}`);
      return null;
    }
  }

  private async fetchExtras(
    entry: BlipEntry,
    journalFolder: string,
    items: GalleryItem[],
  ): Promise<void> {
    const extras: NonNullable<BlipEntry['images']['extras']> = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const isMain = i === 0;

      if (isMain) {
        // For the main image: always attempt original. Hires is downloaded when the
        // original wasn't obtained (fallback — regardless of download_hires) OR when
        // download_hires is on (additive — grab it even though original also
        // succeeded). Same unified rule applies to extra images below.
        const originalRel = JournalIndex.entryOriginalPath(entry.date);
        const originalAbs = joinPath(journalFolder, originalRel);
        let gotOriginal = false;
        if (item.image_urls?.original && !(await this.io.fileExists(originalAbs))) {
          try {
            const url = item.image_urls.original.startsWith('http')
              ? item.image_urls.original
              : `${BLIPFOTO_SITE}${item.image_urls.original}`;
            await this.io.downloadFile(url, originalAbs);
            entry.images.original = originalRel;
            gotOriginal = true;
          } catch (err) {
            this.hadImageGap = true;
            const message = err instanceof Error ? err.message : String(err);
            await this.appendLog(
              'warn',
              `Failed to download main original for ${entry.date}: ${message}`,
            );
          }
        } else if (await this.io.fileExists(originalAbs)) {
          gotOriginal = true;
        }

        if (item.image_urls?.hires && (!gotOriginal || this.config.download_hires)) {
          const hiresRel = JournalIndex.entryHiresPath(entry.date);
          const hiresAbs = joinPath(journalFolder, hiresRel);
          if (await this.io.fileExists(hiresAbs)) {
            entry.images.hires = hiresRel;
          } else {
            try {
              await this.io.downloadFile(item.image_urls.hires, hiresAbs);
              entry.images.hires = hiresRel;
            } catch (err) {
              this.hadImageGap = true;
              const message = err instanceof Error ? err.message : String(err);
              await this.appendLog(
                'warn',
                `Failed to download main hires for ${entry.date}: ${message}`,
              );
            }
          }
        }
        continue;
      }

      // Extra images (i >= 1)
      const itemId = item.item_id_str;
      const extra: NonNullable<BlipEntry['images']['extras']>[number] = { item_id: itemId };

      // Thumbnail + stdres are independent of the original/hires relationship below —
      // always attempted whenever their own URL exists.
      const otherDownloads: Array<{
        label: string;
        url: string;
        destAbs: string;
        assign: (rel: string) => void;
      }> = [];

      if (item.thumbnail_url) {
        otherDownloads.push({
          label: 'extra thumbnail',
          url: item.thumbnail_url,
          destAbs: joinPath(journalFolder, JournalIndex.extraThumbnailPath(entry.date, itemId)),
          assign: (rel) => {
            extra.thumbnail = rel;
          },
        });
      }
      if (item.image_urls?.stdres) {
        otherDownloads.push({
          label: 'extra stdres',
          url: item.image_urls.stdres,
          destAbs: joinPath(journalFolder, JournalIndex.extraImagePath(entry.date, itemId)),
          assign: (rel) => {
            extra.image = rel;
          },
        });
      }

      for (const dl of otherDownloads) {
        if (await this.io.fileExists(dl.destAbs)) {
          // Derive relative path from absolute for the assign call
          const rel = dl.destAbs.slice(journalFolder.length).replace(/^\//, '');
          dl.assign(rel);
          continue;
        }
        try {
          await this.io.downloadFile(dl.url, dl.destAbs);
          const rel = dl.destAbs.slice(journalFolder.length).replace(/^\//, '');
          dl.assign(rel);
        } catch (err) {
          this.hadImageGap = true;
          const message = err instanceof Error ? err.message : String(err);
          await this.appendLog(
            'warn',
            `Failed to download ${dl.label} for ${entry.date} item ${itemId}: ${message}`,
          );
        }
      }

      // Original: attempted sequentially (not batched with the above) so hires below
      // can be conditioned on whether it succeeded — mirrors the main image's
      // gotOriginal pattern above.
      const extraOriginalRel = JournalIndex.extraOriginalPath(entry.date, itemId);
      const extraOriginalAbs = joinPath(journalFolder, extraOriginalRel);
      let gotExtraOriginal = false;
      if (item.image_urls?.original && !(await this.io.fileExists(extraOriginalAbs))) {
        try {
          const url = item.image_urls.original.startsWith('http')
            ? item.image_urls.original
            : `${BLIPFOTO_SITE}${item.image_urls.original}`;
          await this.io.downloadFile(url, extraOriginalAbs);
          extra.original = extraOriginalRel;
          gotExtraOriginal = true;
        } catch (err) {
          this.hadImageGap = true;
          const message = err instanceof Error ? err.message : String(err);
          await this.appendLog(
            'warn',
            `Failed to download extra original for ${entry.date} item ${itemId}: ${message}`,
          );
        }
      } else if (await this.io.fileExists(extraOriginalAbs)) {
        extra.original = extraOriginalRel;
        gotExtraOriginal = true;
      }

      // Hires: fallback when the original wasn't obtained, or always when
      // download_hires is on — same unified rule as the main image.
      if (item.image_urls?.hires && (!gotExtraOriginal || this.config.download_hires)) {
        const extraHiresRel = JournalIndex.extraHiresPath(entry.date, itemId);
        const extraHiresAbs = joinPath(journalFolder, extraHiresRel);
        if (await this.io.fileExists(extraHiresAbs)) {
          extra.hires = extraHiresRel;
        } else {
          try {
            await this.io.downloadFile(item.image_urls.hires, extraHiresAbs);
            extra.hires = extraHiresRel;
          } catch (err) {
            this.hadImageGap = true;
            const message = err instanceof Error ? err.message : String(err);
            await this.appendLog(
              'warn',
              `Failed to download extra hires for ${entry.date} item ${itemId}: ${message}`,
            );
          }
        }
      }

      extras.push(extra);
    }

    if (extras.length > 0) {
      entry.images.extras = extras;
    }
    entry.images.web_scraped = true;
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
      // If the user cancelled while this request was in flight, cancel() only set a
      // flag — it cannot abort the pending fetch. The fetch then rejects (a
      // NetworkError) before the next checkCancelled(). Treat that as the
      // cancellation it really is, not a network failure.
      if (this.cancelled) {
        throw new BackupCancelledError();
      }
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
