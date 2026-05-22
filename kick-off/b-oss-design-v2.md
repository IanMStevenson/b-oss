# b-oss Project Design — v2

> Version 2 of the project design document. The original kick-off notes and design files remain in this folder as reference. This document consolidates and extends that thinking.
>
> **Status**: Working draft — open questions still to resolve flagged with `⚠️`.

---

## 1. Project Vision

**b-oss** (Blipfoto Open Source Software) is an umbrella for a family of open-source tools that interact with the Blipfoto photography journal platform. The goal is to give Blipfoto users ownership of their own content.

The initial application is **b-ark** — a cross-platform desktop app that creates and maintains a local backup of one or more Blipfoto journals: photos, captions, comments, EXIF data, tags, and metadata. "Ark" signifies a place of safety.

A companion tool, **b-view**, is a per-journal viewer — a React app written into the backup folder that lets users browse their archived journal in a browser without needing the app open. It can be deployed to a static web host to share a journal online.

### Naming conventions

Project names are always **lowercase**, even at the start of a sentence.

| Name | Meaning |
|---|---|
| b-oss | Umbrella project / GitHub repository |
| b-ark | The backup desktop application |
| b-view | The per-journal browser-based viewer |
| blipfoto-api | Internal API client library (not separately published) |
| backup-engine | Core backup logic library (platform-agnostic) |

> All references to the earlier working name "blipark" in design files should be treated as b-ark. The "blip" prefix is avoided to respect Blipfoto's trademark.

---

## 2. Goals & Non-Goals

### Must

- Use Blipfoto's OAuth2 to authenticate users (system browser, custom protocol redirect)
- Back up: photos (original resolution), captions, comments (with replies), EXIF, tags, stars/favourites counts, location
- Run on Windows without requiring admin privileges
- Store backup output as portable files (JSON + images) on the user's filesystem
- Be open-sourceable under GPLv3
- Run in the system tray; launch at Windows startup (optional setting)

### Should

- Support multiple Blipfoto accounts
- Run scheduled automatic backups (app manages its own scheduler — no dependency on OS task scheduler)
- Bundle b-view into each backup folder so the user can browse locally or deploy to a web host
- Support Mac (via community contributor — see §11)

### Could

- Generate fully static HTML from the backup (no JS required) — future feature
- Linux support (likely falls out of the build setup naturally)

### Won't

- Be a native Android/iOS app (though the data format and API wrapper are designed for reuse)
- Require expensive cloud services or non-trivial hosting
- Be a Chrome extension
- Require elevated/admin permissions
- Write Markdown sidecar files (v1 — may add later as an optional export)

---

## 3. Repository Structure

b-oss lives in a **single GitHub repository** (`b-oss`) organised as an **npm monorepo using workspaces**. This lets b-ark, b-view, and shared packages be developed together while keeping concerns cleanly separated.

```
b-oss/                          # repo root
├── packages/
│   ├── blipfoto-api/           # Blipfoto API client (no platform deps)
│   ├── backup-engine/          # Core backup logic (PlatformIO interface)
│   ├── b-view/                 # Shared viewer components + standalone SPA
│   ├── b-ark-ui/               # b-ark React UI (BackendContext interface)
│   └── b-ark/                  # Electron shell (ElectronBackend + ElectronPlatformIO)
├── .github/
│   └── workflows/
│       ├── ci.yml              # Type-check, lint, test on every PR
│       ├── release-win.yml     # Windows build + GitHub Release
│       └── release-mac.yml     # Mac build (DISABLED until community contributor)
├── package.json                # Workspace root
├── tsconfig.base.json          # Shared TypeScript config
├── CLAUDE.md                   # Claude Code instructions (see §12)
├── .gitignore
├── README.md
├── LICENSE                     # GPLv3
└── CONTRIBUTING.md
```

### Package responsibilities

| Package | Depends on | Role |
|---|---|---|
| `blipfoto-api` | none | Typed HTTP client for the Blipfoto REST API. Auth, rate-limit handling, all endpoints used by b-ark. No Node or Electron deps — reusable in a future React Native app. |
| `backup-engine` | `blipfoto-api` | Backup algorithm, data model, file-writing strategy. No UI or Electron deps. Platform abstraction via `PlatformIO` (see §5). |
| `b-view` | none | React viewer components (`<ThumbnailGrid>`, `<EntryDetail>`, etc.) **plus** the standalone SPA shell (green top bar, routing). The SPA is written into backup folders by b-ark. Supports `?embedded=true` to suppress its own header when iframed externally. |
| `b-ark-ui` | `b-view` | b-ark's React UI (sidebar, settings, log, account management). Uses a `BackendContext` interface for all native operations — no direct Electron dependencies. Imports b-view components for the main viewing area. Portable to any shell that provides `BackendContext`. |
| `b-ark` | `b-ark-ui`, `backup-engine`, `b-view` | Electron shell. Provides `ElectronBackend` (implements `BackendContext`) and `ElectronPlatformIO` (implements `PlatformIO`). Handles system tray, OAuth redirect server, local HTTP server for b-view, scheduling, auto-update. |

---

## 4. Technology Stack

| Concern | Decision | Notes |
|---|---|---|
| Language | TypeScript (strict mode) | Everywhere — renderer, main process, shared packages |
| App framework | Electron | Stable, well-supported, single installer |
| UI framework | React | Both b-ark and b-view |
| Build tool | Vite + `electron-vite` | Modern, fast HMR; handles Electron's main/renderer/preload split cleanly |
| Packaging | electron-builder + NSIS | Windows per-user install, no admin required |
| Distribution | GitHub Releases | |
| Auto-update | electron-updater | Integrated with GitHub Releases |
| OAuth flow | System browser → custom protocol (`b-ark://oauth/callback`) | Distributed app type in Blipfoto developer portal; implicit token flow; no `client_secret` required |
| Monorepo tooling | npm workspaces | No Nx/Turborepo — keeping the toolchain simple |
| Testing | Vitest | `blipfoto-api` and `backup-engine` packages; Electron main process is integration-tested manually |
| Linting | ESLint + Prettier | |
| CI / CD | GitHub Actions | |
| State persistence | `electron-store` | JSON-backed, typed; accounts, settings, schedule |
| Icon library | Lucide React | Matches the design spec (hairline, `currentColor`) |
| Local HTTP server | `serve-handler` (or similar lightweight Node library) | Serves b-view + backup folder for in-app viewing |

### TypeScript

The monorepo uses a shared `tsconfig.base.json` with `strict: true`. Each package extends it. The `CLAUDE.md` post-tool-use hook runs `tsc --noEmit` after every edit; Claude Code fixes type errors before proceeding.

---

## 5. Architecture & Platform Abstraction

The single most important architectural principle: **the backup logic must not depend on Electron or any desktop-specific API**. This enables future reuse (e.g. React Native).

### The abstraction boundary

`backup-engine` defines a `PlatformIO` interface that the Electron layer implements:

```typescript
// packages/backup-engine/src/platform.ts

export interface PlatformIO {
  // Filesystem
  readFile(path: string): Promise<Buffer>;
  writeFile(path: string, data: Buffer | string): Promise<void>;
  ensureDir(path: string): Promise<void>;
  fileExists(path: string): Promise<boolean>;
  listDir(path: string): Promise<string[]>;
  deleteFile(path: string): Promise<void>;

  // Image download (separate from the API client — no auth header needed for S3 URLs)
  downloadFile(url: string, destPath: string): Promise<void>;

  // Logging (writes to the per-account in-memory log buffer, forwarded to renderer)
  log(level: 'info' | 'warn' | 'error', message: string, accountId: string): void;
}
```

b-ark provides an Electron implementation using Node's `fs/promises`. A future React Native port would provide a `react-native-fs` implementation — the `backup-engine` package remains unchanged.

### The two abstraction boundaries

There are two parallel abstraction layers, one for backend I/O and one for the UI shell:

| Layer | Interface | Implemented by | Enables |
|---|---|---|---|
| Backend storage | `PlatformIO` | `ElectronPlatformIO` in b-ark | Future React Native port of backup-engine |
| UI shell | `BackendContext` | `ElectronBackend` in b-ark | Future Capacitor/iPad port of b-ark-ui |

### Data flow

```
Blipfoto API
     │
     ▼
blipfoto-api              ← typed HTTP client, rate-limit awareness
     │
     ▼
backup-engine             ← backup algorithm, diff logic, schemas, checkpoint
  │       │
  │       ▼
  │    PlatformIO         ← filesystem + download + log (abstract)
  │       │
  │       ▼
  │  ElectronPlatformIO   ← Node fs/promises implementation
  │
  ▼
b-ark Electron main       ← drives backup jobs, scheduler, tray, OAuth, HTTP server
  │
  │  (IPC / contextBridge)
  ▼
ElectronBackend           ← implements BackendContext using window.api
  │
  ▼
b-ark-ui (React)          ← portable UI; uses BackendContext, imports b-view components
  ├── Sidebar, Settings, Log, etc.
  └── <ThumbnailGrid>, <EntryDetail>  ← from b-view package
       │
       ▼
b-view standalone SPA     ← same components + its own shell; written to backup folders
  └── fetch('./journal.json') via local HTTP or web host
```

---

## 6. Data Model

### 6.1 On-disk file structure

```
<user-chosen backup root>/
  <username>/
    journal.json                    # journal metadata + lightweight entry index
    index.html                      # b-view entry point (written by b-ark)
    assets/                         # b-view JS + CSS bundle (written by b-ark)
    entries/
      2024/                         # one folder per year (fixed — no user setting)
        2024-01-15.json             # full entry data, named by date
        2024-01-15.jpg              # original-resolution image, named by date
        2024-01-15-t.jpg            # thumbnail (as selected by user in Blipfoto)
      2023/
        ...
    _log.ndjson                     # append-only backup log (last 5,000 lines kept)
    _checkpoint.json                # present only if a backup was interrupted
```

**Naming convention**: all entry files use `YYYY-MM-DD` format (ISO 8601 date from the Blipfoto entry). Blipfoto enforces one entry per day per journal, so date-based naming will not collide in practice. In the unlikely event of a duplicate date (API quirk), b-ark logs a warning and appends the `entry_id_str` to the filename: `2024-01-15-<id>.json`.

**File types per entry**:
- `YYYY-MM-DD.json` — full entry data
- `YYYY-MM-DD.jpg` — original-resolution image
- `YYYY-MM-DD-t.jpg` — thumbnail (as selected by the user in Blipfoto — honoured as-is)

If the Blipfoto API is extended in future to support multiple images per entry, additional images follow: `YYYY-MM-DD-2.jpg`, `YYYY-MM-DD-3.jpg`, etc.

### 6.2 `journal.json` schema

```typescript
interface JournalMetadata {
  schema_version: 1;
  username: string;
  journal_title: string;
  avatar_url: string;
  entry_total: number;              // as reported by Blipfoto at last backup
  joined_date: string;              // YYYY-MM-DD
  last_backup_at: string;           // ISO 8601
  entries: EntryIndex[];            // lightweight index — enough for b-view listing
}

interface EntryIndex {
  entry_id: string;                 // _str variant always
  date: string;                     // YYYY-MM-DD
  title: string;
  thumbnail_path: string;           // relative to journal.json, e.g. "entries/2024/2024-01-15-t.jpg"
  json_path: string;                // relative to journal.json, e.g. "entries/2024/2024-01-15.json"
}
```

### 6.3 Per-entry JSON schema

```typescript
interface BlipEntry {
  schema_version: 1;

  // Identity
  entry_id: string;                 // _str variant
  date: string;                     // YYYY-MM-DD
  date_stamp: number;               // epoch
  title: string;
  username: string;
  journal_title: string;

  // Content
  description: string;              // raw BBCode
  description_html: string;         // rendered HTML
  tags: string[];
  location: { lat: number; lon: number } | null;

  // Social (point-in-time snapshot)
  views_total: number;
  stars_total: number;
  favorites_total: number;

  // Comments (full tree including replies)
  comments: BlipComment[];

  // EXIF
  exif: {
    make: string | null;
    model: string | null;
    camera: string | null;          // "Make Model" pretty string
    exposure_time: string | null;
    f_number: string | null;
    focal_length: string | null;
    iso: string | null;
  } | null;

  // Local image paths (relative to journal.json)
  images: {
    original?: string;
    original?: string;              // YYYY-MM-DD.jpg
    thumbnail?: string;             // YYYY-MM-DD-t.jpg
  };

  // Backup provenance
  backed_up_at: string;             // ISO 8601
  backup_app_version: string;
}

interface BlipComment {
  comment_id: string;
  parent_id: string | null;
  commenter_username: string;
  commenter_avatar_url: string;
  content: string;                  // raw BBCode
  content_html: string;
  replies: BlipComment[];
}
```

> **64-bit IDs**: The Blipfoto API returns `entry_id` as both integer and `_str`. JavaScript cannot represent the full 64-bit range safely. Always use and store the `_str` variant everywhere.

### 6.4 Backup checkpoint file

A `_checkpoint.json` file in the journal folder allows interrupted backups to resume:

```typescript
interface BackupCheckpoint {
  started_at: string;
  phase: 'discovery' | 'fetch';
  discovery_page_index: number;       // last completed page
  discovered_entry_ids: string[];     // all IDs found so far
  fetched_entry_ids: string[];        // IDs whose JSON + image are written
  total_to_fetch: number;
}
```

On successful backup completion, `_checkpoint.json` is deleted. Its presence at startup means the last backup was interrupted; the engine resumes from the recorded position.

---

## 7. Blipfoto API Integration

### 7.1 Authentication (OAuth2)

b-ark uses the **Blipfoto "distributed app" implicit token flow** with a custom Electron URI scheme:

1. b-ark registers itself as the OS handler for the `b-ark` URI scheme via `app.setAsDefaultProtocolClient('b-ark')` at startup
2. b-ark opens the system browser to the Blipfoto auth URL: `response_type=token`, `client_id=<id>`, `redirect_uri=b-ark://oauth/callback`, `scope=read`, random `state` CSRF token
3. User authorises in their browser; Blipfoto redirects to `b-ark://oauth/callback#access_token=TOKEN&state=...&...`
4. The OS intercepts the `b-ark://` URI scheme and invokes b-ark. Since b-ark enforces single-instance (`app.requestSingleInstanceLock()`), the second-launch attempt fires the `second-instance` event on the running app, passing the URI in `argv`
5. b-ark extracts the token from the URI fragment, validates the `state` matches (CSRF check), encrypts the token via `safeStorage`, and stores it in `electron-store`

No internal HTTP server is needed. No port conflicts. No `client_secret` — the distributed app flow only requires `client_id`.

> **Prerequisite — developer app registration**: Register b-ark at `https://www.blipfoto.com/developer/apps` as a **distributed app** type, with `b-ark://oauth/callback` (or `b-ark://oauth/*`) as the redirect URI. This must be done before the OAuth flow can be built or tested. ⚠️

### 7.2 API client (`blipfoto-api` package)

Base URL: `https://api.blipfoto.com/4/`. All requests include `Authorization: Bearer <token>`.

Key behaviours:
- All `_id` fields are stored as strings (always use `_str` variant)
- `X-RateLimit-Remaining` is inspected on every response
- When `Remaining` reaches 0, the client sleeps until `X-RateLimit-Reset` seconds have elapsed, then retries
- Error code 11 (rate limit exceeded) triggers the same sleep-and-retry
- An `onRateLimit(secondsToWait: number)` callback is available for the UI to surface "paused — resuming in Xs"

**Endpoints used**:

| Endpoint | Purpose |
|---|---|
| (OAuth handled via URI scheme — no API call needed for token exchange) | |
| `GET /user/profile` | Fetch journal title, avatar, entry count after OAuth |
| `GET /entries/journal` | Paginated entry listing (page_size: 100) |
| `GET /entry` | Full entry detail with `return_details`, `return_comments`, `include_replies`, `return_metadata`, `return_image_urls` all set to 1 |

> **Image URL authentication**: Example URLs in the API docs are plain S3 URLs. These are expected to be publicly accessible without an auth header. This should be confirmed with a quick test before building the download logic. ⚠️

### 7.3 Backup algorithm

**First backup** (no local data):

1. Paginate `GET /entries/journal` (100/page) to get all `{entry_id, date}` pairs → write checkpoint
2. For each entry: `GET /entry` with all detail flags → write JSON → download `original` image → download thumbnail → update checkpoint
3. Rewrite `journal.json` index, delete checkpoint, write b-view files

**Routine backup** (local data exists):

1. Fetch `GET /user/profile` — update `entry_total` in `journal.json`
2. **Redo recent**: fetch full detail for the N most recent entries (default N=7), overwrite local JSON. Picks up caption edits, new comments, updated star/favourite counts. Note: comments and counts on entries older than the redo window will reflect their state at time of first backup and won't be refreshed unless they fall within the redo window.
3. **Gap fill**: scan `journal.json` entry index for any missing dates in the last G days (default G=31); fetch those
4. Re-download any image files that are missing despite having a JSON entry
5. Update `journal.json` index and `last_backup_at`

Between each entry fetch, the engine sleeps for `api_delay_ms` (default 0). The engine pauses gracefully when rate-limited and resumes automatically. All writes are atomic where possible (write to `*.tmp` then rename).

### 7.4 Progress events

```typescript
type BackupEvent =
  | { type: 'started';      account_id: string; total_to_fetch: number }
  | { type: 'progress';     account_id: string; done: number; total: number; current_date: string }
  | { type: 'rate_limited'; account_id: string; resume_in_seconds: number }
  | { type: 'completed';    account_id: string; total_archived: number }
  | { type: 'failed';       account_id: string; error: BackupError };

type BackupError =
  | { kind: 'auth_expired' }          // token invalid — show Reauthorise
  | { kind: 'network' }               // transient; retry next scheduled run
  | { kind: 'api_error'; code: number; message: string }
  | { kind: 'filesystem'; message: string };
```

---

## 8. Error Recovery

### Token expiry / invalid token (Blipfoto error code 51)

When the API returns error 51 during a backup:

1. Backup stops immediately (no partial writes in progress — each entry is written atomically)
2. Account RAG state → red, `error_message` → "Access token expired — reauthorise account"
3. If the app window is hidden (system tray), it is shown immediately (foreground the window)
4. The Settings panel for the affected account opens, with the "Reauthorise" button highlighted
5. The user completes reauth; on success, RAG clears and the backup can be restarted manually or at next scheduled run

### Transient network / API errors

- Single entry fails: log the error, skip that entry, continue. Entry is retried on next backup run.
- Three consecutive failures: stop the backup, set RAG amber, log "backup paused after 3 consecutive errors — will retry at next scheduled run"

### Filesystem errors

- If b-ark cannot write to the backup folder (permissions, disconnected drive, full disk): stop immediately, RAG red, surface a clear error message with the specific path and OS error. The app window is brought to foreground.

### Interrupted backup (app closed mid-run)

The checkpoint file records all progress. On next startup (or next scheduled run), the engine detects the checkpoint and resumes from where it left off. No data is lost.

---

## 9. IPC Contract & BackendContext

### BackendContext — the portable UI interface

`b-ark-ui` components never call `window.api` directly. Instead, they use a `BackendContext` React context. The context value is a `BackendContext` object — a typed interface that abstracts all native operations:

```typescript
// packages/b-ark-ui/src/backend.ts

export interface BackendContext {
  // Accounts
  addAccount(): Promise<void>;
  removeAccount(accountId: string): Promise<void>;
  reauthoriseAccount(accountId: string): Promise<void>;

  // Backup
  startBackup(accountId: string): Promise<void>;
  cancelBackup(accountId: string): Promise<void>;

  // Viewing
  openViewer(accountId: string): Promise<void>;         // starts local HTTP server + opens browser

  // Settings
  pickFolder(): Promise<string | null>;
  updateAccountSettings(accountId: string, settings: Partial<AccountConfig>): Promise<void>;

  // Data
  getStore(): Promise<AppStore>;
  getLogs(accountId: string): Promise<LogEntry[]>;

  // Events (returns unsubscribe function)
  subscribe(handler: (event: MainEvent) => void): () => void;
}
```

b-ark provides `ElectronBackend` which implements this by delegating to `window.api` (Electron IPC). A future Capacitor shell provides `CapacitorBackend`. Components are identical in both cases.

### Electron IPC layer (b-ark)

All IPC channels are typed in `packages/b-ark/src/preload.ts`. `ElectronBackend` is a thin wrapper around `window.api`. The main process never exposes raw Node APIs to the renderer.

```typescript
// packages/b-ark/src/preload.ts — window.api shape
// (mirrors BackendContext — ElectronBackend wraps these calls)
interface ElectronAPI {
  addAccount(): Promise<void>;
  removeAccount(accountId: string): Promise<void>;
  reauthoriseAccount(accountId: string): Promise<void>;
  startBackup(accountId: string): Promise<void>;
  cancelBackup(accountId: string): Promise<void>;
  openViewer(accountId: string): Promise<void>;
  pickFolder(): Promise<string | null>;
  updateAccountSettings(accountId: string, settings: Partial<AccountConfig>): Promise<void>;
  getStore(): Promise<AppStore>;
  getLogs(accountId: string): Promise<LogEntry[]>;
  on(channel: 'main-event', handler: (event: MainEvent) => void): () => void;
}
```

### Main → Renderer events

```typescript
type MainEvent =
  | { type: 'store:changed';  store: AppStore }
  | { type: 'backup:event';   event: BackupEvent }
  | { type: 'log:entry';      account_id: string; entry: LogEntry };
```

---

## 10. Logging

### What gets logged

Each account maintains an append-only log. Log entries are written by `backup-engine` via `PlatformIO.log()` and by b-ark for OAuth events and scheduler events.

```typescript
interface LogEntry {
  id: string;                         // uuid
  account_id: string;
  timestamp: string;                  // ISO 8601
  level: 'info' | 'warn' | 'error';
  message: string;
}
```

### Log persistence

⚠️ **OPEN QUESTION — log storage**: Options:

- **In-memory only**: Fast, simple. Lost on app restart. Sufficient for debugging a current session.
- **Persisted to a log file** (e.g. `<journal-folder>/_log.ndjson`): Survives restarts, useful for diagnosing recurring failures, adds value for open-source debugging. Adds a small write on each log entry.

**Recommendation**: Persist to `_log.ndjson` (newline-delimited JSON, append-only). Keep the last N lines (e.g. 5,000) by truncating on startup. The log file is in the backup folder so it moves with the backup. Decision needed before building the log screen.

---

## 11. Scheduling & System Tray

- Scheduler is **internal to b-ark** — no OS task scheduler dependency
- Per-account schedule: next-run datetime + hour (0–23) + interval (daily/weekly/monthly)
- On startup: b-ark calculates the next due run time and schedules a `setTimeout`; when it fires it runs the backup and reschedules
- If the machine was off at the scheduled time: b-ark checks on startup whether a scheduled run is overdue (next_run < now); if so, runs immediately
- **"Start with Windows"** (in scope for v1): writes `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` with the app path — no admin required
- **Tray icon**: reflects worst RAG state across all accounts. Right-click menu: "Open b-ark" / "Exit"
- Closing the main window hides it to tray. Exit in the tray menu is the only way to fully quit.
- Single-instance enforcement: launching a second instance focuses the existing window

---

## 12. State Management (b-ark)

### electron-store schema (main process, persisted to disk)

```typescript
interface AppStore {
  accounts: AccountConfig[];
  ui: {
    thumbnailSizePercent: number;       // default 100
    accountOrder: string[];             // account IDs in display order
  };
  app: {
    startWithWindows: boolean;          // default false
  };
}

interface AccountConfig {
  id: string;                           // uuid v4
  username: string;
  journal_title: string;
  avatar_url: string;
  access_token: string;                 // encrypted via safeStorage
  backup_folder: string;                // absolute path
  schedule: {
    next_run: string;                   // ISO 8601
    hour: number;                       // 0–23
    interval: 'daily' | 'weekly' | 'monthly';
  };
  gap_check_days: number;               // default 31
  redo_count: number;                   // default 7
  api_delay_ms: number;                 // default 0; ms pause between each GET /entry call
  last_backup_at: string | null;
  total_archived: number;
  rag_state: 'green' | 'amber' | 'red';
  error_message: string | null;
}
```

### Runtime state (renderer, React context + useReducer)

- Selected account ID
- Right-panel mode: `null | 'settings' | 'log'`
- Per-account backup progress: `{ running: boolean; done: number; total: number; current_date: string }`
- Per-account log buffer: `LogEntry[]`
- Thumbnail size percentage

No Redux. The state surface is small; React context is sufficient.

---

## 13. UI Design

### Source of truth

Full design spec: `kick-off/b-ark design/design_handoff_blipark/README.md`. Screenshots in `screenshots/`. Interactive prototype: open `blipark.html` in any modern browser.

Design files use "blipark" — treat as "b-ark" everywhere.

### Design tokens (key values)

| Token | Hex | Use |
|---|---|---|
| `--green-800` | `#1f4d3a` | Top bar, primary buttons, accent icons |
| `--green-700` | `#2a6347` | Primary button hover |
| `--green-100` | `#eef2ee` | Selected sidebar row, progress banner bg |
| `--ink` | `#111111` | Primary text |
| `--muted` | `#6b7280` | Secondary text, labels |
| `--bg` | `#ffffff` | App background |
| `--rag-green` | `#22a06b` | Status: up to date |
| `--rag-amber` | `#e8a93c` | Status: catching up / warning |
| `--rag-red` | `#d04545` | Status: error / needs attention |

Typography: `"Helvetica Neue", Helvetica, Arial, sans-serif`. Monospace (paths, timestamps, log): `ui-monospace, "SF Mono", Menlo, monospace`.

### Screens

| # | Screen | Trigger |
|---|---|---|
| 1 | First open / Add account | Zero accounts |
| 2 | OAuth success | Successful auth return |
| 3 | Home | Default; at least one account |
| 4 | Empty account | Account added, no backup yet |
| 5 | Backup in progress | "Backup now" clicked |
| 6 | Settings panel | Gear icon / "Set up now" / "Review settings" |
| 7 | Log panel | Log icon / "View log" |

### Info button (b-ark)

A small **"i" icon button** sits in the top-right of the b-ark top bar. Clicking it opens a modal containing: what b-oss is, copyright notice, GPLv3 licence, and a link to the b-oss GitHub repository.

### App shell

- Window: top bar (52px) + sidebar (268px) + main area + status bar (38px, home only)
- Settings and Log panels take over the full main area; sidebar rows disabled at 45% opacity while open
- Window chrome: 12px rounded corners, soft drop shadow; native traffic-light buttons deferred to OS

### React component structure

**b-ark-ui** (`packages/b-ark-ui/src/`):
```
backend.ts                    ← BackendContext interface + useBackend() hook
App.tsx
tokens.css                    ← shared CSS custom properties (imported by b-view too)
components/
  shell/
    TopBar.tsx
    Sidebar.tsx
    StatusBar.tsx
  screens/
    FirstOpenScreen.tsx
    OAuthSuccessScreen.tsx
    HomeScreen.tsx             ← renders <ThumbnailGrid> from b-view
    EmptyAccountScreen.tsx
    BackupProgressBanner.tsx
    SettingsPanel.tsx
    LogPanel.tsx
  shared/
    RagIndicator.tsx
    AccountRow.tsx
    LogTable.tsx
    Button.tsx
    Input.tsx
    Select.tsx
    DatePicker.tsx
```

**b-view** (`packages/b-view/src/`):
```
components/
  ThumbnailGrid.tsx           ← used by b-ark-ui HomeScreen + b-view SPA
  EntryCard.tsx
  EntryDetail.tsx             ← used by b-view SPA entry route
  Pagination.tsx
  CommentThread.tsx
  ExifPanel.tsx
app/
  ViewerShell.tsx             ← b-view top bar + hash router (standalone SPA only)
  index.tsx                   ← SPA entry point
index.ts                      ← package exports (components, no shell)
```

---

## 14. b-view Architecture

### Component sharing — the key principle

b-view is **not** a separate embedded app inside b-ark. Instead, b-view exports its core React components as a package, and b-ark-ui imports and uses them directly. Both the standalone SPA and the b-ark main area render the same components:

```
packages/b-view/
  src/
    components/
      ThumbnailGrid.tsx     ← used by both b-ark-ui and b-view SPA
      EntryDetail.tsx       ← used by both
      EntryCard.tsx         ← thumbnail card with hover state
      Pagination.tsx        ← page nav (« 1 2 3 ... 30 »)
      CommentThread.tsx     ← comments + replies
      ExifPanel.tsx         ← camera data panel
    app/
      ViewerShell.tsx       ← standalone SPA shell: top bar + routing
      index.tsx             ← SPA entry point
  index.ts                  ← package exports (components only, no shell)
```

b-ark-ui's home screen IS `<ThumbnailGrid>`. The settings and log panels are b-ark-only UI. b-view-specific chrome (green top bar with b-view wordmark) only appears in the standalone SPA.

### The `?embedded=true` parameter

The standalone b-view SPA supports a `?embedded=true` query parameter. When set, it suppresses the b-view top bar. This is intended for the use case where a user deploys their backup to a web host and wants to iframe b-view into their own website.

It is **not** used for embedding within b-ark — b-ark-ui imports the components directly.

### Placement in backup folder

```
<backup-root>/
  <username>/
    index.html          ← b-view SPA entry point
    assets/             ← Vite-built JS + CSS bundle
    journal.json
    entries/
      2024/
        2024-01-15.json
        2024-01-15.jpg
        2024-01-15-thumb.jpg
```

### How b-view loads data

b-view uses `fetch('./journal.json')` for all data loading. Relative paths work when served over HTTP.

**Three serving contexts**:

1. **Via b-ark "View" button** (primary): b-ark starts a temporary localhost HTTP server pointing at the journal folder and opens `http://localhost:<port>/index.html` in the system browser. `fetch()` works perfectly. The server runs until app exit or next backup.
2. **Deployed to a static web host**: User uploads the journal folder. `fetch()` works normally.
3. **Double-clicked from file manager** (`file://` protocol): Chrome blocks `fetch()` from `file://` by default. b-view catches the fetch failure and falls back to the File System Access API: shows an "Open backup folder" button; user selects the folder once; b-view reads all JSON via `FileSystemDirectoryHandle`. Firefox skips the fallback entirely.

### b-view update strategy

b-ark bundles the b-view build as a packaged resource (via `electron-vite`). On each backup run, b-ark copies the current b-view bundle into the journal folder, overwriting any older version. The viewer stays current with the latest b-ark release automatically.

### b-view visual design

Reference screenshots are in `kick-off/blipfoto-screenshots/`. The Blipfoto website itself provides the design reference:

- **Thumbnail grid** (`NavigationPage.png`): square crops in a responsive grid, entry title below each thumbnail, simple numbered pagination (`« 1 2 3 ... 30 Older »`). White background, clean layout.
- **Entry detail** (`EntryPage.png`): large photo at top (constrained to a sensible max-width), title + journal name + date, description text below, right-side panel for EXIF/stats, tags, comments section below.

b-view uses the same green design tokens as b-ark (CSS custom properties from a shared `tokens.css`). The standalone SPA top bar uses `--green-800` with a white **b-view** wordmark. Entry detail and thumbnail grid are white-background, matching Blipfoto's own aesthetic.

### b-view features (v1)

- Thumbnail grid with pagination (entries loaded from `journal.json` index)
- Thumbnail size controls (same zoom in/out/reset as b-ark)
- Entry detail view: full image, title, date, description (rendered from `description_html`), tags, EXIF panel, comments with replies
- Previous / Next navigation on entry detail (from index order)
- `?embedded=true` suppresses top bar (for external iframe embedding)
- **Photo navigation** on entry detail:
  - Left/right arrow buttons flanking the photo (always visible, as seen on Blipfoto's own entry page)
  - Left/right keyboard shortcuts (← →) for hands-free navigation
  - Clicking the left or right half of the photo itself also navigates (the photo is divided into two invisible click zones); subtle directional arrow overlay appears on hover
- **Photo sizing**: the photo container is fixed-width and has a max-height constraint. Photos are displayed with `object-fit: contain` and a light grey (`#e5e5e5`) background. Portrait images fill the height and show grey sidebars; landscape images fill the width and show grey bars above/below if unusually short. This matches Blipfoto's own presentation (see `kick-off/blipfoto-screenshots/EntryPage.png`).
- **Info button**: "i" icon in the top-right of the b-view top bar; opens a modal popup containing: what b-view is, copyright notice, GPLv3 licence statement, and a link to the b-oss GitHub repository. Always visible — not suppressed by `?embedded=true`.

---

## 15. Build, CI & Release

### Windows

- `electron-builder` with NSIS, per-user install (no admin)
- Code signing: purchase Certum/Sectigo certificate before public release (~£60–100/year). Not needed for development. ⚠️
- GitHub Actions: on `release/*` tag push → build → upload to GitHub Releases → electron-updater notifies existing installs

### Mac

- `electron-builder` config covers Mac from day one
- GitHub Actions Mac workflow present but **disabled** (commented out)
- `CONTRIBUTING.md` calls out Mac build owner as an open contribution
- Cannot cross-compile Mac builds — requires a macOS runner with Apple signing

### Linux

- AppImage target falls out of `electron-builder` naturally
- Not formally supported in v1 but no active obstacle

### Auto-update

- `electron-updater` checks GitHub Releases on startup
- Windows initially; Mac when the Mac workflow is enabled

---

## 16. Development Workflow, Tooling & Infrastructure

### CLAUDE.md

`CLAUDE.md` at the repo root tells Claude Code how to work in this codebase:

```markdown
# b-oss — Claude Code instructions

## Monorepo structure
packages/blipfoto-api  — Blipfoto HTTP client (no Node/Electron deps)
packages/backup-engine — Backup logic (PlatformIO interface, no Electron deps)
packages/b-view        — Shared React viewer components + standalone SPA
packages/b-ark-ui      — b-ark React UI (BackendContext interface, no Electron deps)
packages/b-ark         — Electron shell (ElectronBackend + ElectronPlatformIO)

## Architecture rules
- Two abstraction boundaries: PlatformIO (backend I/O) and BackendContext (UI shell).
- blipfoto-api, backup-engine, b-view, b-ark-ui must never import from 'electron'.
- b-ark-ui components must never call window.api directly — use useBackend() hook.
- Access tokens: main process only. Never pass to renderer via IPC.
- All Blipfoto _id fields: always use _str variant, store as string.
- Atomic file writes: write to path + '.tmp' then rename.
- Naming: always lowercase hyphenated — "b-ark", "b-view", "b-oss".

## TypeScript
- strict: true everywhere. Never use `any`.
- Path aliases: @b-oss/blipfoto-api, @b-oss/backup-engine, @b-oss/b-view, @b-oss/b-ark-ui

## Hooks (run after every file edit — fix errors before proceeding)
post-tool-use: npm run typecheck   # tsc --noEmit across all packages
post-tool-use: npm run lint        # ESLint --max-warnings 0

## Tests
npm test   → Vitest across all packages
npm run test:watch → watch mode
```

### VSCode setup

`.vscode/` folder committed to the repo:

- **`settings.json`**: format-on-save (Prettier), ESLint fix-on-save, TypeScript path aliases, Vitest as test runner
- **`extensions.json`**: recommended — ESLint, Prettier, TypeScript Next, Vitest Explorer, GitLens
- **`launch.json`**: debug configs for Electron main process, renderer (Chrome DevTools protocol), Vitest with debugger
- **`tasks.json`**: build tasks per package + "build all"

### Collaborator setup

`.nvmrc` pins the Node version (≥ 20 LTS). Contributors run:

```bash
git clone https://github.com/<user>/b-oss.git
cd b-oss
nvm use                  # switches to correct Node version
npm run setup            # see below
```

`npm run setup` (`scripts/setup.js`):
1. Checks Node version
2. `npm install`
3. Builds packages in dependency order: `blipfoto-api` → `backup-engine` → `b-view` → `b-ark-ui` → `b-ark`
4. Copies `.env.example` to `.env.local` if not already present
5. `npm run typecheck`
6. Prints setup complete + reminder to edit `.env.local`

### Secrets management

**Blipfoto API credentials**: because b-ark uses the **distributed app** OAuth flow, only the `client_id` is required — no `client_secret`. This significantly simplifies secrets management: the client_id is a public identifier (it's sent in the browser URL that the user sees during OAuth), so it does not need to be kept secret. It can be committed to the repository or documented publicly.

In practice, we keep it in `.env.local` / GitHub Secrets for consistency and so forks can substitute their own registration, but there is no genuine secret to protect.

| Context | Credentials |
|---|---|
| Local development | `.env.local` (gitignored). Copy from `.env.example`. |
| GitHub Actions CI/CD | GitHub Secrets: `BLIPFOTO_CLIENT_ID` |
| Code-signing (future) | GitHub Secrets: `WIN_CSC_LINK` (base64 PFX), `WIN_CSC_KEY_PASSWORD` |

`electron-vite` injects `BLIPFOTO_CLIENT_ID` into the main process bundle. `.env.example` shows the required variable. User access tokens are obtained at runtime, stored encrypted via `safeStorage`, and never leave the device.

### Pre-commit hooks

**Husky + lint-staged**: runs type-check and ESLint on staged files before every commit. Prevents broken types or lint errors from reaching the remote.

### Unit testing

| Package | Tools | Key test scenarios |
|---|---|---|
| `blipfoto-api` | Vitest + msw (Mock Service Worker) | Rate limit header handling, sleep-and-retry on error 11, all endpoint response parsing, 64-bit ID string handling |
| `backup-engine` | Vitest + mock PlatformIO | First backup, routine backup (redo + gap fill), checkpoint save/restore, interrupted resume, delay between requests |
| `b-view` | Vitest + React Testing Library | ThumbnailGrid renders from index, pagination, EntryDetail layout, left/right navigation |
| `b-ark-ui` | Vitest + RTL + mock BackendContext | Screen transitions, backup progress, settings form validation, RAG state |
| `b-ark` main | Manual / integration only | Thin wiring layer; logic tested via the packages above |

### GitHub Releases & distribution

GitHub Releases is the distribution mechanism. electron-builder publishes to it; electron-updater reads from it.

**Release process** (documented in `docs/releasing.md`):

1. Update `CHANGELOG.md` with the new version's changes
2. Bump version: `npm version patch|minor|major` at repo root (updates all package.json files via a version script)
3. Push the commit and tag: `git push && git push --tags`
4. GitHub Actions `release-win.yml` triggers on `v*` tags:
   - Installs deps, builds all packages, runs `electron-builder --win`
   - Uploads the NSIS installer + `latest.yml` manifest to a GitHub Release draft
   - `GITHUB_TOKEN` (automatically available in Actions) authorises the upload
5. Developer reviews the draft on GitHub, adds release notes (from CHANGELOG), publishes
6. Existing installs: `electron-updater` checks GitHub Releases on next launch, downloads the new installer, prompts the user to restart

**Mac releases** (future): same process but requires a macOS runner and Apple signing credentials in Secrets. Workflow is present but commented out until a Mac contributor enables it.

### Documentation files

| File | Purpose |
|---|---|
| `README.md` | Project overview, features, screenshots, download link |
| `CONTRIBUTING.md` | Setup, architecture overview, how to get API credentials, PR process, Mac build ownership, code style |
| `ARCHITECTURE.md` | The two abstraction boundaries, package graph, IPC contract, file naming conventions |
| `CHANGELOG.md` | Keep a Changelog format |
| `docs/releasing.md` | Step-by-step release process |
| `LICENSE` | GPLv3 |

---

## 17. Open Questions (remaining)

| # | Question | Status |
|---|---|---|
| OQ-1 | Blipfoto developer app registration | Register as **distributed app** type at `blipfoto.com/developer/apps` with redirect URI `b-ark://oauth/callback`. Must be done before auth work begins. **Blocking**. ⚠️ |
| OQ-2 | Image URL authentication | Test early: fetch a known Blipfoto image URL without auth header. Expected to be public S3. ⚠️ |
| OQ-3 | Log persistence | **Decided**: append to `_log.ndjson` in backup folder, keep last 5,000 lines. ✓ |
| OQ-4 | Code-signing certificate | Purchase before public release. Not blocking for development. |

---

## 18. Future Scope (out of v1)

- Android app — `blipfoto-api` and `backup-engine` are already designed for reuse
- Static HTML export — generate a zero-JS rendition of the backup
- Markdown sidecar export — per-entry `.md` files
- b-search — full-text search across a backup
- b-print — photobook export

---

*Last updated: 2026-05-22*
| 5 | Backup in progress | "Backup now" clicked |
| 6 | Settings panel | Gear icon / "Set up now" / "Review settings" |
| 7 | Log panel | Log icon / "View log" |

### Info button (b-ark)

A small **"i" icon button** sits in the top-right of the b-ark top bar. Clicking it opens a modal containing: what b-oss is, copyright notice, GPLv3 licence, and a link to the b-oss GitHub repository.

### App shell

- Window: top bar (52px) + sidebar (268px) + main area + status bar (38px, home only)
- Settings and Log panels take over the full main area; sidebar rows disabled at 45% opacity while open
- Window chrome: 12px rounded corners, soft drop shadow; native traffic-light buttons deferred to OS

### Settings panel — fields (in order)

1. **Folder** — path input + "Choose…" folder picker button
2. **Schedule** — date input (YYYY-MM-DD + picker), hour dropdown (00:00–23:00), interval dropdown (Daily / Weekly / Monthly)
3. **Gap check** — integer input + "days" label. Default 31. Description: "Look back this many days on each run and fill in any missing entries."
4. **Redo** — integer input + "entries" label. Default 7. Description: "Re-fetch this many of your most recent entries each run to pick up caption edits and new comments. Comments and star counts on older entries reflect the state when they were first backed up."
5. **Delay** — integer input + "ms" label. Default 0. Description: "Pause between API calls (milliseconds). Increase this if you want b-ark to use less bandwidth while you're working."
6. **Account** — "Reauthorise" button (secondary) + "Remove account" button (secondary, text in `--rag-red`)

### React component structure

**b-ark-ui** (`packages/b-ark-ui/src/`):
```
backend.ts                    ← BackendContext interface + useBackend() hook
App.tsx
tokens.css                    ← shared CSS custom properties (imported by b-view too)
components/
  shell/
    TopBar.tsx
    Sidebar.tsx
    StatusBar.tsx
    InfoModal.tsx             ← shared by b-ark and b-view standalone
  screens/
    FirstOpenScreen.tsx
    OAuthSuccessScreen.tsx
    HomeScreen.tsx             ← renders <ThumbnailGrid> from b-view
    EmptyAccountScreen.tsx
    BackupProgressBanner.tsx
    SettingsPanel.tsx
    LogPanel.tsx
  shared/
    RagIndicator.tsx
    AccountRow.tsx
    LogTable.tsx
    Button.tsx
    Input.tsx
    Select.tsx
    DatePicker.tsx
```

**b-view** (`packages/b-view/src/`):
```
components/
  ThumbnailGrid.tsx           ← used by b-ark-ui HomeScreen + b-view SPA
  EntryCard.tsx
  EntryDetail.tsx             ← used by b-view SPA entry route
  Pagination.tsx
  CommentThread.tsx
  ExifPanel.tsx
app/
  ViewerShell.tsx             ← b-view top bar + hash router (standalone SPA only)
  index.tsx                   ← SPA entry point
index.ts                      ← package exports (components only, no shell)
```

---

## 14. b-view Architecture

### Component sharing — the key principle

b-view is **not** a separate embedded app inside b-ark. Instead, b-view exports its core React components as a package, and b-ark-ui imports and uses them directly. Both the standalone SPA and the b-ark main area render the same components.

### The `?embedded=true` parameter

The standalone b-view SPA supports a `?embedded=true` query parameter which suppresses the b-view top bar. This is for the use case where a user deploys their backup to a web host and wants to iframe b-view into their own website. It is **not** used for embedding within b-ark — b-ark-ui imports the components directly.

### Placement in backup folder

```
<backup-root>/
  <username>/
    index.html          ← b-view SPA entry point
    assets/             ← Vite-built JS + CSS bundle
    journal.json
    entries/
      2024/
        2024-01-15.json
        2024-01-15.jpg
        2024-01-15-t.jpg
```

### How b-view loads data

b-view uses `fetch('./journal.json')` for all data loading. Three serving contexts:

1. **Via b-ark "View" button** (primary): b-ark starts a temporary localhost HTTP server pointing at the journal folder and opens `http://localhost:<port>/index.html` in the system browser. The server runs until app exit.
2. **Deployed to a static web host**: `fetch()` works normally.
3. **Double-clicked from file manager** (`file://`): b-view catches the fetch failure and falls back to the File System Access API — shows an "Open backup folder" button; user selects the folder once.

### b-view update strategy

b-ark bundles the b-view build as a packaged resource. On each backup run, b-ark copies the current b-view bundle into the journal folder, overwriting any older version.

### b-view visual design

- Reference: `kick-off/blipfoto-screenshots/` for layout and photo presentation patterns
- Same green design tokens as b-ark (shared `tokens.css`)
- Standalone SPA top bar: `--green-800` with white **b-view** wordmark + "i" info button (top right)
- Entry detail photo container: fixed width, max-height constrained; `object-fit: contain; background: #e5e5e5` — portrait photos show grey sidebars, matching Blipfoto's own presentation

### b-view features (v1)

- Thumbnail grid with pagination (`« 1 2 3 ... 30 »`)
- Thumbnail size controls (zoom in/out/reset — same as b-ark)
- Entry detail: full image, title, date, description (rendered from `description_html`), tags, EXIF panel, star/favourite counts, comments with replies
- **Photo navigation** (entry detail):
  - Left ◄ / Right ► arrow buttons flanking the photo
  - Left/right keyboard shortcuts (← →)
  - Clicking left or right half of the photo itself navigates (invisible click zones; directional arrow overlay on hover)
- `?embedded=true` suppresses top bar; info button always remains visible
- **Info button**: opens modal with b-oss description, copyright, GPLv3 licence, GitHub link

---

## 15. Build, CI & Release

### Windows

- `electron-builder` + NSIS, per-user install (no admin)
- Code signing: purchase Certum/Sectigo certificate before public release (~£60–100/year). GitHub Secret: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`.
- Release workflow: push `v*` tag → `release-win.yml` builds → uploads installer + `latest.yml` to GitHub Release draft → developer publishes

### Mac

- `electron-builder` config covers Mac from day one
- GitHub Actions Mac workflow present but **disabled** (commented out)
- `CONTRIBUTING.md` calls out Mac build owner as an open contribution

### Linux

- AppImage target falls out of `electron-builder` naturally; not formally supported in v1

### Auto-update

- `electron-updater` checks GitHub Releases on startup
- Windows initially; Mac when the Mac workflow is enabled

### Release process (summary — full details in `docs/releasing.md`)

1. Update `CHANGELOG.md`
2. `npm version patch|minor|major` at repo root
3. `git push && git push --tags`
4. GitHub Actions builds and uploads to GitHub Release draft
5. Developer reviews and publishes the draft
6. Existing installs auto-update on next launch

---

## 16. Development Workflow, Tooling & Infrastructure

### CLAUDE.md

`CLAUDE.md` at the repo root tells Claude Code how to work in this codebase:

```markdown
# b-oss — Claude Code instructions

## Monorepo structure
packages/blipfoto-api  — Blipfoto HTTP client (no Node/Electron deps)
packages/backup-engine — Backup logic (PlatformIO interface, no Electron deps)
packages/b-view        — Shared React viewer components + standalone SPA
packages/b-ark-ui      — b-ark React UI (BackendContext interface, no Electron deps)
packages/b-ark         — Electron shell (ElectronBackend + ElectronPlatformIO)

## Architecture rules
- Two abstraction boundaries: PlatformIO (backend I/O) and BackendContext (UI shell).
- blipfoto-api, backup-engine, b-view, b-ark-ui must never import from 'electron'.
- b-ark-ui components must never call window.api directly — use useBackend() hook.
- Access tokens: main process only. Never pass to renderer via IPC.
- All Blipfoto _id fields: always use _str variant, store as string.
- Atomic file writes: write to path + '.tmp' then rename.
- Naming: always lowercase hyphenated — "b-ark", "b-view", "b-oss".

## TypeScript
- strict: true everywhere. Never use `any`.
- Path aliases: @b-oss/blipfoto-api, @b-oss/backup-engine, @b-oss/b-view, @b-oss/b-ark-ui

## Hooks (run after every file edit — fix errors before proceeding)
post-tool-use: npm run typecheck   # tsc --noEmit across all packages
post-tool-use: npm run lint        # ESLint --max-warnings 0

## Tests
npm test         → Vitest across all packages
npm run test:watch → watch mode
```

### VSCode setup

`.vscode/` folder committed to the repo:
- **`settings.json`**: format-on-save (Prettier), ESLint fix-on-save, TypeScript path aliases, Vitest as test runner
- **`extensions.json`**: ESLint, Prettier, TypeScript Next, Vitest Explorer, GitLens
- **`launch.json`**: debug configs for Electron main process, renderer, Vitest with debugger
- **`tasks.json`**: build tasks per package + "build all"

### Collaborator setup

`.nvmrc` pins the Node version (≥ 20 LTS). Contributors run:

```bash
git clone https://github.com/<user>/b-oss.git
cd b-oss
nvm use
npm run setup    # installs, builds in order, copies .env.example → .env.local, typechecks
```

### Secrets management

| Context | Credentials |
|---|---|
| Local dev | `.env.local` (gitignored). Copy from `.env.example`. |
| CI/CD | GitHub Secrets: `BLIPFOTO_CLIENT_ID`, `BLIPFOTO_CLIENT_SECRET` |
| Code signing (future) | GitHub Secrets: `WIN_CSC_LINK` (base64 PFX), `WIN_CSC_KEY_PASSWORD` |

Credentials injected into **main process bundle only** at build time. `.env.example` committed with empty values. User access tokens stored encrypted by `safeStorage`, never in source or CI.

### Pre-commit hooks

Husky + lint-staged: typecheck and ESLint run on staged files before every commit.

### Unit testing

| Package | Tools | Key scenarios |
|---|---|---|
| `blipfoto-api` | Vitest + msw | Rate limit headers, sleep-and-retry, auth code exchange, 64-bit IDs |
| `backup-engine` | Vitest + mock PlatformIO | First backup, routine backup, checkpoint resume, gap fill, delay |
| `b-view` | Vitest + RTL | ThumbnailGrid, EntryDetail, pagination, navigation |
| `b-ark-ui` | Vitest + RTL + mock BackendContext | Screen transitions, backup progress, settings validation, RAG state |
| `b-ark` main | Manual / integration | Thin wiring — logic tested via packages above |

### Documentation files

| File | Purpose |
|---|---|
| `README.md` | Project overview, features, screenshots, download link |
| `CONTRIBUTING.md` | Setup, architecture overview, API credentials, PR process, Mac build |
| `ARCHITECTURE.md` | Abstraction boundaries, package graph, IPC contract, file naming |
| `CHANGELOG.md` | Keep a Changelog format |
| `docs/releasing.md` | Step-by-step release process with exact commands |
| `LICENSE` | GPLv3 |

---

## 17. Open Questions (remaining)

| # | Question | Status |
|---|---|---|
| OQ-1 | Blipfoto developer app registration | Must register as **web app** type with `http://localhost` wildcard redirect before auth work begins. **Blocking**. ⚠️ |
| OQ-2 | Image URL authentication | Test early: fetch a known image URL without auth header. Expected: public S3. ⚠️ |
| OQ-3 | Code-signing certificate | Purchase before public release. Not blocking for development. |

---

## 18. Future Scope (out of v1)

- Android/iOS app — `blipfoto-api` and `backup-engine` designed for reuse; `b-ark-ui` portable via `BackendContext`
- Static HTML export — generate a zero-JS rendition of the backup
- Markdown sidecar export — per-entry `.md` files with YAML frontmatter
- b-search — full-text search across a backup
- b-print — photobook export

---

*Last updated: 2026-05-22*
m reaching the remote.

### Unit testing

| Package | Tools | Key scenarios |
|---|---|---|
| `blipfoto-api` | Vitest + msw | Rate limit headers, sleep-and-retry, auth code exchange, 64-bit IDs |
| `backup-engine` | Vitest + mock PlatformIO | First backup, routine backup, checkpoint resume, gap fill, delay |
| `b-view` | Vitest + RTL | ThumbnailGrid, EntryDetail, pagination, navigation |
| `b-ark-ui` | Vitest + RTL + mock BackendContext | Screen transitions, backup progress, settings validation, RAG state |
| `b-ark` main | Manual / integration | Thin wiring — logic tested via packages above |

### Documentation files

| File | Purpose |
|---|---|
| `README.md` | Project overview, features, screenshots, download link |
| `CONTRIBUTING.md` | Setup, architecture overview, API credentials, PR process, Mac build |
| `ARCHITECTURE.md` | Abstraction boundaries, package graph, IPC contract, file naming |
| `CHANGELOG.md` | Keep a Changelog format |
| `docs/releasing.md` | Step-by-step release process with exact commands |
| `LICENSE` | GPLv3 |

---

## 17. Open Questions (remaining)

| # | Question | Status |
|---|---|---|
| OQ-1 | Blipfoto developer app registration | Must register as **web app** type with `http://localhost` wildcard redirect before auth work begins. **Blocking**. ⚠️ |
| OQ-2 | Image URL authentication | Test early: fetch a known image URL without auth header. Expected: public S3. ⚠️ |
| OQ-3 | Code-signing certificate | Purchase before public release. Not blocking for development. |

---

## 18. Future Scope (out of v1)

- Android/iOS app — `blipfoto-api` and `backup-engine` designed for reuse; `b-ark-ui` portable via `BackendContext`
- Static HTML export — zero-JS rendition of the backup
- Markdown sidecar export — per-entry `.md` files with YAML frontmatter
- b-search — full-text search across a backup
- b-print — photobook export

---

*Last updated: 2026-05-22*

**Mac releases** (future): same process but requires a macOS runner and Apple signing credentials in Secrets. Workflow present but commented out until a Mac contributor enables it.

### Documentation files

| File | Purpose |
|---|---|
| `README.md` | Project overview, features, screenshots, download link |
| `CONTRIBUTING.md` | Setup, architecture overview, API credentials, PR process, Mac build |
| `ARCHITECTURE.md` | Abstraction boundaries, package graph, IPC contract, file naming |
| `CHANGELOG.md` | Keep a Changelog format |
| `docs/releasing.md` | Step-by-step release process with exact commands |
| `LICENSE` | GPLv3 |

---

## 17. Open Questions (remaining)

| # | Question | Status |
|---|---|---|
| OQ-1 | Blipfoto developer app registration | Must register as **web app** type with `http://localhost` wildcard redirect before auth work begins. **Blocking**. ⚠️ |
| OQ-2 | Image URL authentication | Test early: fetch a known image URL without auth header. Expected: public S3. ⚠️ |
| OQ-3 | Code-signing certificate | Purchase before public release. Not blocking for development. |

---

## 18. Future Scope (out of v1)

- Android/iOS app — `blipfoto-api` and `backup-engine` designed for reuse; `b-ark-ui` portable via `BackendContext`
- Static HTML export — zero-JS rendition of the backup
- Markdown sidecar export — per-entry `.md` files with YAML frontmatter
- b-search — full-text search across a backup
- b-print — photobook export

---

*Last updated: 2026-05-22*
