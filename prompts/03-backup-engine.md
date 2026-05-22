# Prompt 3 — `packages/backup-engine`

## Context

You are building **b-oss**. Prompts 1 and 2 scaffolded the monorepo and built the Blipfoto API client. You are now implementing the `backup-engine` package — the core backup algorithm and data model.

This package has **no UI, no Electron, and no Node-specific dependencies beyond what the PlatformIO interface provides**. It is the portable heart of b-ark. The Electron layer will supply a concrete `PlatformIO` implementation in Prompt 6; this package only defines the interface and consumes it.

---

## Package location

`packages/backup-engine/`

Replace the stub `src/index.ts` with the structure described below.

---

## File structure to create

```
packages/backup-engine/src/
  platform.ts          # PlatformIO interface
  types.ts             # all shared data types (BlipEntry, JournalMetadata, etc.)
  errors.ts            # BackupError union + BackupAbortedError class
  log-manager.ts       # LogManager — reads/writes _log.ndjson
  checkpoint.ts        # CheckpointManager — reads/writes _checkpoint.json
  journal-index.ts     # JournalIndex — reads/writes journal.json
  backup-engine.ts     # BackupEngine class — the backup algorithm
  index.ts             # barrel export
  __tests__/
    backup-engine.test.ts
```

---

## 1. `src/platform.ts` — PlatformIO interface

```typescript
export interface PlatformIO {
  // Filesystem
  readFile(path: string): Promise<Buffer>;
  writeFile(path: string, data: Buffer | string): Promise<void>;
  ensureDir(path: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  listDir(path: string): Promise<string[]>;
  deleteFile(path: string): Promise<void>;

  // Image download (S3 URLs — no auth header needed)
  downloadFile(url: string, destPath: string): Promise<void>;

  // Logging — writes to the per-account log
  // (in b-ark: appends to _log.ndjson and sends to renderer via IPC)
  log(level: 'info' | 'warn' | 'error', message: string, accountId: string): void;
}
```

---

## 2. `src/types.ts` — data types

### LogEntry

```typescript
export interface LogEntry {
  id: string;           // uuid v4
  account_id: string;
  timestamp: string;    // ISO 8601
  level: 'info' | 'warn' | 'error';
  message: string;
}
```

### BlipComment

```typescript
export interface BlipComment {
  comment_id: string;       // _str variant always
  parent_id: string | null; // _str variant
  commenter_username: string;
  commenter_avatar_url: string;
  content: string;          // raw BBCode
  content_html: string;
  replies: BlipComment[];
}
```

### BlipEntry — the per-entry JSON file schema

```typescript
export interface BlipEntry {
  schema_version: 1;

  // Identity
  entry_id: string;         // _str variant always
  date: string;             // YYYY-MM-DD
  date_stamp: number;       // epoch
  title: string;
  username: string;
  journal_title: string;

  // Content
  description: string;      // raw BBCode
  description_html: string;
  tags: string[];
  location: { lat: number; lon: number } | null;

  // Social snapshot
  views_total: number;
  stars_total: number;
  favorites_total: number;

  // Comments (full tree, replies nested)
  comments: BlipComment[];

  // EXIF
  exif: {
    make: string | null;
    model: string | null;
    camera: string | null;
    exposure_time: string | null;
    f_number: string | null;
    focal_length: string | null;
    iso: string | null;
  } | null;

  // Image paths relative to journal.json
  images: {
    original?: string;    // e.g. "entries/2024/2024-01-15.jpg"
    thumbnail?: string;   // e.g. "entries/2024/2024-01-15-t.jpg"
  };

  // Provenance
  backed_up_at: string;         // ISO 8601
  backup_app_version: string;   // semver string, passed in by caller
}
```

### EntryIndex — lightweight record in journal.json entries array

```typescript
export interface EntryIndex {
  entry_id: string;         // _str variant
  date: string;             // YYYY-MM-DD
  title: string;
  thumbnail_path: string;   // relative path, e.g. "entries/2024/2024-01-15-t.jpg"
  json_path: string;        // relative path, e.g. "entries/2024/2024-01-15.json"
}
```

### JournalMetadata — journal.json root schema

```typescript
export interface JournalMetadata {
  schema_version: 1;
  username: string;
  journal_title: string;
  avatar_url: string;
  entry_total: number;        // as reported by Blipfoto at last backup
  last_backup_at: string;     // ISO 8601
  entries: EntryIndex[];      // sorted descending by date (newest first)
}
```

### BackupCheckpoint — _checkpoint.json

```typescript
export interface BackupCheckpoint {
  started_at: string;                   // ISO 8601
  phase: 'discovery' | 'fetch';
  discovery_page_index: number;         // last completed page (0-indexed)
  discovered_entry_ids: string[];       // all entry_id_str found during discovery
  fetched_entry_ids: string[];          // IDs whose JSON + image are fully written
  total_to_fetch: number;
}
```

### BackupEvent

```typescript
export type BackupEvent =
  | { type: 'started';      account_id: string; total_to_fetch: number }
  | { type: 'progress';     account_id: string; done: number; total: number; current_date: string }
  | { type: 'rate_limited'; account_id: string; resume_in_seconds: number }
  | { type: 'completed';    account_id: string; total_archived: number }
  | { type: 'failed';       account_id: string; error: BackupErrorPayload };

export type BackupErrorPayload =
  | { kind: 'auth_expired' }
  | { kind: 'network' }
  | { kind: 'api_error'; code: number; message: string }
  | { kind: 'filesystem'; message: string };
```

### AccountBackupConfig — what the engine needs from the Electron store

```typescript
export interface AccountBackupConfig {
  id: string;
  username: string;
  journal_title: string;
  avatar_url: string;
  access_token: string;       // plaintext — caller decrypts before passing in
  backup_folder: string;      // absolute path to the backup root (chosen by user)
  redo_count: number;         // default 7
  gap_check_days: number;     // default 31
  api_delay_ms: number;       // default 0
  app_version: string;        // semver — written into each backed-up entry
}
```

---

## 3. `src/errors.ts`

```typescript
/** Thrown internally to signal a clean abort (e.g. cancellation or token expiry) */
export class BackupAbortedError extends Error {
  constructor(
    public readonly payload: import('./types.js').BackupErrorPayload,
  ) {
    super(payload.kind);
    this.name = 'BackupAbortedError';
  }
}
```

---

## 4. `src/log-manager.ts` — LogManager

Manages the `_log.ndjson` file inside a journal backup folder.

### Interface

```typescript
export class LogManager {
  constructor(private readonly io: PlatformIO, private readonly journalFolder: string) {}

  /** Append a log entry to _log.ndjson. Creates the file if absent. */
  async append(entry: LogEntry): Promise<void>;

  /** Read all log entries from _log.ndjson. Returns [] if file absent. */
  async readAll(): Promise<LogEntry[]>;

  /**
   * Trim the log file to at most maxLines lines.
   * Call once on startup / after backup completion — not on every write.
   */
  async trim(maxLines: number): Promise<void>;
}
```

### Implementation notes

- Path: `<journalFolder>/_log.ndjson`
- `append`: serialise the `LogEntry` as a single line of JSON, then `\n`, then `writeFile` by appending. Because `PlatformIO.writeFile` overwrites, you must `readFile` → append line → `writeFile`. Alternatively, accept that `PlatformIO` doesn't support append and do read-then-write atomically (this is fine for the log — it's low-frequency).
- `trim`: `readAll()` → keep last `maxLines` lines → write back
- Never throw on log errors — catch internally and call `io.log('warn', ...)` if the log file itself fails

---

## 5. `src/checkpoint.ts` — CheckpointManager

```typescript
export class CheckpointManager {
  constructor(private readonly io: PlatformIO, private readonly journalFolder: string) {}

  /** Returns the checkpoint if one exists, otherwise null */
  async load(): Promise<BackupCheckpoint | null>;

  /** Write the checkpoint (atomic: write to .tmp then rename via writeFile) */
  async save(checkpoint: BackupCheckpoint): Promise<void>;

  /** Delete the checkpoint file (call on successful completion) */
  async clear(): Promise<void>;
}
```

Path: `<journalFolder>/_checkpoint.json`

For atomicity: write to `_checkpoint.tmp` first, then immediately write `_checkpoint.json`. This is a pragmatic approach given PlatformIO has no rename operation. (The Electron implementation could later add a `renameFile` method for true atomicity, but this is sufficient for v1.)

---

## 6. `src/journal-index.ts` — JournalIndex

```typescript
export class JournalIndex {
  constructor(private readonly io: PlatformIO, private readonly journalFolder: string) {}

  /** Load journal.json. Returns null if not found (first backup). */
  async load(): Promise<JournalMetadata | null>;

  /** Write journal.json. Entries are sorted descending by date. */
  async save(metadata: JournalMetadata): Promise<void>;

  /** Build an EntryIndex record from a BlipEntry */
  static toEntryIndex(entry: BlipEntry): EntryIndex;

  /** Build a relative path for an entry file, e.g. "entries/2024/2024-01-15.json" */
  static entryJsonPath(date: string): string;
  static entryImagePath(date: string): string;
  static entryThumbnailPath(date: string): string;
}
```

### Path helpers

All paths are relative to `journalFolder`:

- JSON: `entries/YYYY/YYYY-MM-DD.json`
- Image: `entries/YYYY/YYYY-MM-DD.jpg`
- Thumbnail: `entries/YYYY/YYYY-MM-DD-t.jpg`

Extract `YYYY` from the `YYYY-MM-DD` date string (take the first 4 chars).

**Collision guard**: if a file already exists at the computed path and its `entry_id` differs from the one being written (extremely unlikely — one entry per day — but guard anyway), append `-<entry_id>` suffix before the extension: `2024-01-15-<id>.json`. Log a warning via `io.log`.

---

## 7. `src/backup-engine.ts` — BackupEngine

This is the core class. Instantiate it per backup job; do not reuse across multiple accounts.

### Constructor

```typescript
export class BackupEngine {
  constructor(
    private readonly config: AccountBackupConfig,
    private readonly io: PlatformIO,
    private readonly client: BlipfotoClient,  // from blipfoto-api package
    private readonly onEvent: (event: BackupEvent) => void,
  ) {}
}
```

Import `BlipfotoClient` and error types from `blipfoto-api`.

### Cancellation

Add a private `cancelled = false` flag. Expose a `cancel()` method that sets it to `true`. At every async operation boundary inside `run()`, check `if (this.cancelled) throw new BackupAbortedError({ kind: 'network' })` — the cancelled backup is treated as a transient network abort, not an error (the caller decides how to handle it).

### Public API

```typescript
/** Run the full backup. Resolves when complete, throws BackupAbortedError on failure/cancel. */
async run(): Promise<void>;

/** Signal the running backup to stop at the next safe point. */
cancel(): void;
```

### `run()` implementation

```typescript
async run(): Promise<void> {
  const journalFolder = path.join(this.config.backup_folder, this.config.username);
  // journalFolder is the root for this account's backup
  await this.io.ensureDir(journalFolder);

  const checkpointMgr = new CheckpointManager(this.io, journalFolder);
  const logMgr = new LogManager(this.io, journalFolder);
  const journalIndex = new JournalIndex(this.io, journalFolder);

  try {
    const existingIndex = await journalIndex.load();

    if (existingIndex === null) {
      // No complete backup exists yet. `runFirstBackup` checks for a checkpoint internally
      // and resumes from where it left off if one is present.
      await this.runFirstBackup(journalFolder, checkpointMgr, logMgr, journalIndex);
    } else {
      // journal.json exists → at least one complete backup has run → routine backup.
      // A checkpoint here would be a stale artefact; clear it before proceeding.
      await checkpointMgr.clear();
      await this.runRoutineBackup(journalFolder, existingIndex, checkpointMgr, logMgr, journalIndex);
    }
  } catch (err) {
    if (err instanceof BackupAbortedError) {
      this.onEvent({ type: 'failed', account_id: this.config.id, error: err.payload });
      this.io.log('error', `Backup failed: ${err.payload.kind}`, this.config.id);
    }
    throw err;
  }
}
```

> Note: `path.join` should use a simple string join — do not import Node's `path` module. Instead, use a local helper:
>
> ```typescript
> function joinPath(...parts: string[]): string {
>   return parts.join('/').replace(/\/+/g, '/');
> }
> ```
>
> This keeps the package free of Node dependencies and works correctly on all platforms since the Electron implementation will convert slashes as needed.

### `runFirstBackup()`

1. **Discovery phase** (paginate all entries):
   - Load checkpoint if present (may have partial discovery from a previous interrupted run)
   - Start from `checkpoint?.discovery_page_index + 1 ?? 0`
   - Call `client.getJournalEntries({ username: config.username, pageIndex, pageSize: 100 })`
   - Accumulate `entry_id_str` + `date` pairs
   - After each page, save checkpoint with updated `discovery_page_index` and `discovered_entry_ids`
   - Continue until `page.more === 0`
   - Emit `{ type: 'started', account_id, total_to_fetch: discoveredIds.length }`

2. **Fetch phase**:
   - Transition checkpoint to `phase: 'fetch'`, save
   - For each `entry_id_str` not already in `checkpoint.fetched_entry_ids`:
     - `checkCancelled()`
     - Call `fetchAndWriteEntry(entryIdStr, journalFolder, io)`
     - Update checkpoint `fetched_entry_ids`, save
     - Emit `progress` event
     - If `config.api_delay_ms > 0`, sleep

3. **Finalise**:
   - Build `JournalMetadata` and save via `journalIndex.save()`
   - Delete checkpoint via `checkpointMgr.clear()`
   - Trim log to 5,000 lines
   - Emit `{ type: 'completed', account_id, total_archived: fetchedCount }`
   - Log `info`: `"First backup complete — N entries archived"`

### `runRoutineBackup()`

1. **Update profile**: call `client.getUserProfile({ returnDetails: true })`, update `journal_title`, `avatar_url`, `entry_total` in `journalIndex`

2. **Redo recent** (`config.redo_count` entries, default 7):
   - Take the first N entries from the existing journal index (sorted newest-first)
   - Re-fetch and re-write each (overwriting existing JSON and images)
   - Log `info` for each re-fetched entry

3. **Gap fill** (last `config.gap_check_days` days, default 31):
   - Compute the set of dates in the last G days (from today backwards)
   - Cross-reference with `journal.entries` index to find which dates have no entry
   - For each missing date, check whether Blipfoto has one: call `getJournalEntries` for just that period, or simply check for a date in the stub entries from the redo step. A pragmatic approach: call `client.getJournalEntries({ username, pageIndex: 0, pageSize: 100 })` to get recent stubs; if a missing date appears, fetch it fully. For dates further back, assume they were captured in the first backup. Log any gaps discovered.
   - Fetch and write any newly discovered entries

4. **Repair missing images**:
   - Scan `journal.entries` for any entry whose `images.original` file does not exist on disk (`io.fileExists`)
   - Re-download from the API (re-fetch the entry to get a fresh `image_urls`)
   - Log a warning for each repaired entry

5. **Finalise**: update `journal.json`, trim log, emit `completed`

### `fetchAndWriteEntry()` — private helper

```typescript
private async fetchAndWriteEntry(
  entryIdStr: string,
  journalFolder: string,
): Promise<BlipEntry>
```

1. Call the API with a rate-limit-aware retry loop:

   Rate limiting is **not an error** — it is a normal operational pause. The engine must wait and resume transparently. Implement a private `callWithRateLimitPause<T>(fn: () => Promise<T>): Promise<T>` helper:

   ```typescript
   private async callWithRateLimitPause<T>(fn: () => Promise<T>): Promise<T> {
     while (true) {
       try {
         return await fn();
       } catch (err) {
         if (err instanceof BlipfotoError && err.isRateLimited) {
           // The client already slept and retried once; we're still limited.
           // Pause for the reset window + a small buffer and try again.
           const waitSeconds = (this.client.rateLimitInfo?.resetInSeconds ?? 900) + 5;
           this.onEvent({ type: 'rate_limited', account_id: this.config.id, resume_in_seconds: waitSeconds });
           this.io.log('info', `Rate limited — pausing ${waitSeconds}s`, this.config.id);
           await sleep(waitSeconds * 1000);
           // Loop and retry — do NOT throw, do NOT count as a failure
         } else {
           throw err; // non-rate-limit errors propagate normally
         }
       }
     }
   }
   ```

   Use this helper to call `getEntry`:
   ```typescript
   const response = await this.callWithRateLimitPause(() =>
     this.client.getEntry(entryIdStr, { returnDetails: true, returnMetadata: true, returnComments: true, includeReplies: true, returnImageUrls: true })
   );
   ```

   For non-rate-limit errors from the API call:
   - If `BlipfotoError.isTokenInvalid`: throw `BackupAbortedError({ kind: 'auth_expired' })`
   - If `BlipfotoError` (other): log warn, throw for caller to handle consecutive-failure logic
   - If `NetworkError`: throw `BackupAbortedError({ kind: 'network' })`

2. Map the API response to a `BlipEntry`:
   - Use `entry_id_str` always
   - Map `details.views.total`, `details.stars.total`, `details.favorites.total`
   - Map `comments.list` into `BlipComment[]` (flatten replies into the `replies` array on each comment)
   - Map `metadata` to `exif`; if `metadata` is null/absent, set `exif: null`

3. Determine file paths using `JournalIndex` static helpers

4. Write JSON atomically:
   - Serialise `BlipEntry` → write to `<jsonPath>.tmp` → write to `<jsonPath>` (overwrite)

5. Download images:
   - If `image_urls.original` is present: `io.downloadFile(url, <imagePath>)`
   - If `image_urls.lores` (thumbnail from API) is present: `io.downloadFile(url, <thumbnailPath>)`
   - Note: the Blipfoto API returns `thumbnail_url` on the entry stub and `image_urls` on the full entry. Use `image_urls.original` for the main image, `thumbnail_url` from the stub (or `image_urls.lores`) for the thumbnail. The user selects their own thumbnail in Blipfoto — honour it as-is.
   - If any download fails with a network error, log a warning and continue (missing images are repaired by the next routine backup run)

6. Return the `BlipEntry`

### Error counting (consecutive failures)

Track a `consecutiveFailures` counter in `run()`. Reset to 0 on each successful `fetchAndWriteEntry`. If it reaches 3:
- Emit `{ type: 'failed', error: { kind: 'api_error', ... } }`
- Log `warn`: "Backup paused after 3 consecutive errors — will retry at next scheduled run"
- Throw `BackupAbortedError`

**Rate-limit pauses do not count as failures.** `callWithRateLimitPause` handles rate limits internally before `fetchAndWriteEntry` returns — from the caller's perspective, the entry either succeeded or threw a non-rate-limit error. The `consecutiveFailures` counter is therefore never incremented due to rate limiting.

---

## 8. `src/index.ts` — barrel export

```typescript
export * from './platform.js';
export * from './types.js';
export * from './errors.js';
export * from './log-manager.js';
export * from './checkpoint.ts';
export * from './journal-index.js';
export * from './backup-engine.js';
```

---

## 9. Tests

Location: `packages/backup-engine/src/__tests__/backup-engine.test.ts`

Use **Vitest**. Mock `PlatformIO` with a simple in-memory implementation (a `MockPlatformIO` class that stores files in a `Map<string, Buffer | string>`). Mock `BlipfotoClient` with `vi.fn()` / `vi.spyOn`.

### MockPlatformIO

```typescript
class MockPlatformIO implements PlatformIO {
  files = new Map<string, string>();
  downloads: Array<{ url: string; destPath: string }> = [];
  logs: Array<{ level: string; message: string; accountId: string }> = [];

  async readFile(path: string): Promise<Buffer> {
    const content = this.files.get(path);
    if (!content) throw new Error(`File not found: ${path}`);
    return Buffer.from(content);
  }
  async writeFile(path: string, data: Buffer | string): Promise<void> {
    this.files.set(path, typeof data === 'string' ? data : data.toString());
  }
  async ensureDir(_path: string): Promise<void> {}
  async fileExists(path: string): Promise<boolean> { return this.files.has(path); }
  async listDir(_path: string): Promise<string[]> { return []; }
  async deleteFile(path: string): Promise<void> { this.files.delete(path); }
  async downloadFile(url: string, destPath: string): Promise<void> {
    this.downloads.push({ url, destPath });
    this.files.set(destPath, `<image:${url}>`);
  }
  log(level: 'info' | 'warn' | 'error', message: string, accountId: string): void {
    this.logs.push({ level, message, accountId });
  }
}
```

### Required test cases

**JournalIndex**

1. `entryJsonPath('2024-01-15')` returns `'entries/2024/2024-01-15.json'`
2. `entryThumbnailPath('2023-12-31')` returns `'entries/2023/2023-12-31-t.jpg'`
3. `save()` writes journal.json with entries sorted newest-first

**CheckpointManager**

4. `load()` returns `null` when no checkpoint file exists
5. `save()` then `load()` round-trips correctly
6. `clear()` deletes the file; subsequent `load()` returns `null`

**LogManager**

7. `append()` + `readAll()` returns the appended entries
8. `trim(2)` on a 5-entry log keeps only the 2 most recent entries
9. Log file absent → `readAll()` returns `[]` without throwing

**BackupEngine — first backup**

10. Runs discovery (2 pages), fetches 2 entries, writes JSON files, writes journal.json, deletes checkpoint
11. Emits `started` then 2 × `progress` events then `completed`
12. If the first API call returns `BlipfotoError(51)`, emits `failed { kind: 'auth_expired' }` and throws

**BackupEngine — resume interrupted first backup**

13. Given: no `journal.json` but a `_checkpoint.json` with `phase: 'fetch'` and 1 of 2 entries already in `fetched_entry_ids`. Engine should call `getEntry` only once (for the remaining entry), not twice. The checkpoint is the trigger — not the absence of `journal.json` alone.

**BackupEngine — cancellation**

14. Calling `engine.cancel()` after the first `fetchAndWriteEntry` causes the engine to stop before the second entry

**BackupEngine — consecutive failures**

15. Three consecutive non-rate-limit `getEntry` failures (`BlipfotoError` code 202) emit `failed` and abort

**BackupEngine — rate limiting is a pause, not a failure**

16. `getEntry` returns `BlipfotoError(11)` on the first call, then succeeds on the second call. The engine emits one `rate_limited` event, then continues normally. The entry is successfully written. `consecutiveFailures` remains 0 throughout. (Use `vi.useFakeTimers()` to avoid actually waiting.)

17. `getEntry` returns `BlipfotoError(11)` on three consecutive calls before eventually succeeding on the fourth. The engine emits three `rate_limited` events, sleeps three times, then successfully fetches the entry. No `failed` event is emitted.

**BackupEngine — routine backup redo**

18. With existing `journal.json` containing 3 entries, `redo_count=2` re-fetches only the 2 most recent

---

## package.json additions

No new runtime dependencies beyond `blipfoto-api` (already listed as a workspace dependency in Prompt 1). Ensure `devDependencies` includes Vitest (already in root).

---

## Acceptance criteria

- [ ] `npm run typecheck` passes with zero errors from this package
- [ ] `npm test --workspace=packages/backup-engine` — all tests pass
- [ ] No `import ... from 'node:*'` or `import ... from 'electron'` anywhere in `src/` — zero Node/Electron deps
- [ ] `PlatformIO.log` is called (not `console.log`) for all significant events
- [ ] Every `entry_id` written to disk uses the `_str` variant
- [ ] All JSON file writes use the tmp-then-overwrite pattern
- [ ] Checkpoint is saved after every page of discovery and after every fetched entry
- [ ] `BackupEngine.cancel()` causes `run()` to stop within one entry boundary
- [ ] Three consecutive non-rate-limit `fetchAndWriteEntry` failures abort the backup
- [ ] Token-invalid errors immediately throw `BackupAbortedError({ kind: 'auth_expired' })` — no retry
- [ ] Rate-limit pauses never increment `consecutiveFailures` — a backup that rate-limits 100 times then succeeds is still a success
- [ ] If `journal.json` is absent (regardless of whether a checkpoint exists), `runFirstBackup` is called — not `runRoutineBackup`
- [ ] If `journal.json` exists, `runRoutineBackup` is called even if a checkpoint file is present (the checkpoint is cleared first)
- [ ] `journal.json` entries array is always sorted newest-first (by `date`, descending)

## Do NOT

- Do not import from `node:path`, `node:fs`, or any Node built-in
- Do not call `console.log` or `console.error` — use `io.log` exclusively
- Do not make network requests directly — use `BlipfotoClient` only
- Do not implement a `rename` or append operation in `PlatformIO` (not in the interface) — use read/write
- Do not assume the backup folder separator is `\` — always use `/` in paths within this package
- Do not hard-code the max log lines (5,000) — pass it as a parameter to `logMgr.trim()`
- Do not write b-view files (index.html, assets/) — that is done by b-ark in Prompt 6
