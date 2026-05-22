# Prompt 5 — `packages/b-ark-ui`

## Context

You are building **b-oss**. Prompts 1–4 are complete. You are now implementing `b-ark-ui` — the React UI for the b-ark desktop app.

`b-ark-ui` is the **portable UI shell** for b-ark. It never imports Electron directly; instead it uses a `BackendContext` interface for all native operations. This makes the UI reusable (e.g. a future Capacitor/iPad port provides a different `BackendContext` implementation, the components remain unchanged).

The package imports **b-view components** (`ThumbnailGrid`, `EntryDetail`) for the main viewing area.

---

## Design reference

The authoritative design spec is at `D:\B-oss\kick-off\b-ark design\design_handoff_blipark\README.md`. Read it before building. Screenshots are in `D:\B-oss\kick-off\b-ark design\design_handoff_blipark\screenshots\`. Key extracts are repeated below for convenience.

**Design tokens**: See the README — replicate all CSS custom property tokens. Import from `b-view`'s `tokens.css` OR duplicate them here (prefer duplication for independence).

**Typography**: `"Helvetica Neue", Helvetica, Arial, sans-serif`, body `13px / 1.45`. Lucide React icons throughout (`strokeWidth={1.6}`, `currentColor`).

---

## Package location

`packages/b-ark-ui/`

---

## File structure

```
packages/b-ark-ui/src/
  styles/
    tokens.css
    global.css
  backend.ts              # BackendContext interface + all shared types
  electron-backend.ts     # ElectronBackend — implements BackendContext via window.api
  context/
    AppContext.tsx         # React context + provider
    reducer.ts            # useReducer state + actions
  components/
    TopBar.tsx
    Sidebar.tsx
    AccountRow.tsx
    BackupBanner.tsx
    StatusBar.tsx
    InfoBadge.tsx         # the ⓘ info popup (b-ark version)
    screens/
      FirstOpenScreen.tsx
      OAuthSuccessScreen.tsx
      HomeScreen.tsx
      EmptyAccountScreen.tsx
      SettingsPanel.tsx
      LogPanel.tsx
  App.tsx
  index.ts                # exports App + BackendContext + types
```

---

## 1. `src/backend.ts` — BackendContext and shared types

### AccountConfig

```typescript
export interface AccountConfig {
  id: string;                     // uuid v4
  username: string;
  journal_title: string;
  avatar_url: string;
  access_token: string;           // encrypted in store — do NOT display or log
  backup_folder: string;          // absolute path
  schedule: {
    next_run: string;             // ISO 8601
    hour: number;                 // 0–23
    interval: 'daily' | 'weekly' | 'monthly';
  };
  gap_check_days: number;         // default 31
  redo_count: number;             // default 7
  api_delay_ms: number;           // default 0
  last_backup_at: string | null;
  total_archived: number;
  rag_state: 'green' | 'amber' | 'red';
  error_message: string | null;
}
```

### AppStore

```typescript
export interface AppStore {
  accounts: AccountConfig[];
  ui: {
    thumbnailSizePercent: number;  // default 100
    accountOrder: string[];        // account IDs in display order
  };
  app: {
    startWithWindows: boolean;
  };
}
```

### LogEntry

```typescript
export interface LogEntry {
  id: string;
  account_id: string;
  timestamp: string;   // ISO 8601
  level: 'info' | 'warn' | 'error';
  message: string;
}
```

### BackupEvent + MainEvent

```typescript
export type BackupErrorPayload =
  | { kind: 'auth_expired' }
  | { kind: 'network' }
  | { kind: 'api_error'; code: number; message: string }
  | { kind: 'filesystem'; message: string };

export type BackupEvent =
  | { type: 'started';      account_id: string; total_to_fetch: number }
  | { type: 'progress';     account_id: string; done: number; total: number; current_date: string }
  | { type: 'rate_limited'; account_id: string; resume_in_seconds: number }
  | { type: 'completed';    account_id: string; total_archived: number }
  | { type: 'failed';       account_id: string; error: BackupErrorPayload };

export type MainEvent =
  | { type: 'store:changed'; store: AppStore }
  | { type: 'backup:event'; event: BackupEvent }
  | { type: 'log:entry'; account_id: string; entry: LogEntry };
```

### BackendContext interface

```typescript
export interface BackendContext {
  // OAuth / account management
  addAccount(): Promise<void>;
  removeAccount(accountId: string): Promise<void>;
  reauthoriseAccount(accountId: string): Promise<void>;

  // Backup
  startBackup(accountId: string): Promise<void>;
  cancelBackup(accountId: string): Promise<void>;

  // Viewer
  openViewer(accountId: string): Promise<void>;

  // Settings
  pickFolder(): Promise<string | null>;
  updateAccountSettings(accountId: string, settings: Partial<AccountConfig>): Promise<void>;

  // Data
  getStore(): Promise<AppStore>;
  getLogs(accountId: string): Promise<LogEntry[]>;

  // Real-time events (returns unsubscribe fn)
  subscribe(handler: (event: MainEvent) => void): () => void;
}
```

---

## 2. `src/electron-backend.ts` — ElectronBackend

Implements `BackendContext` by delegating to `window.api` (exposed by the Electron preload in Prompt 6).

```typescript
declare global {
  interface Window {
    api: {
      addAccount(): Promise<void>;
      removeAccount(id: string): Promise<void>;
      reauthoriseAccount(id: string): Promise<void>;
      startBackup(id: string): Promise<void>;
      cancelBackup(id: string): Promise<void>;
      openViewer(id: string): Promise<void>;
      pickFolder(): Promise<string | null>;
      updateAccountSettings(id: string, settings: Partial<AccountConfig>): Promise<void>;
      getStore(): Promise<AppStore>;
      getLogs(id: string): Promise<LogEntry[]>;
      on(channel: 'main-event', handler: (event: MainEvent) => void): () => void;
    };
  }
}

export class ElectronBackend implements BackendContext {
  addAccount = () => window.api.addAccount();
  removeAccount = (id: string) => window.api.removeAccount(id);
  reauthoriseAccount = (id: string) => window.api.reauthoriseAccount(id);
  startBackup = (id: string) => window.api.startBackup(id);
  cancelBackup = (id: string) => window.api.cancelBackup(id);
  openViewer = (id: string) => window.api.openViewer(id);
  pickFolder = () => window.api.pickFolder();
  updateAccountSettings = (id: string, settings: Partial<AccountConfig>) =>
    window.api.updateAccountSettings(id, settings);
  getStore = () => window.api.getStore();
  getLogs = (id: string) => window.api.getLogs(id);
  subscribe = (handler: (event: MainEvent) => void) =>
    window.api.on('main-event', handler);
}
```

---

## 3. `src/context/reducer.ts` — UI state

```typescript
export interface BackupProgress {
  running: boolean;
  done: number;
  total: number;
  current_date: string;
  rate_limited_seconds: number | null;
}

export interface AppState {
  store: AppStore | null;
  selectedAccountId: string | null;
  panel: null | 'settings' | 'log';
  selectedEntryId: string | null;     // for in-app viewer
  thumbnailSizePercent: number;       // runtime; synced to store.ui.thumbnailSizePercent
  backupProgress: Record<string, BackupProgress>;
  logBuffer: Record<string, LogEntry[]>;
}

export type AppAction =
  | { type: 'store:loaded'; store: AppStore }
  | { type: 'store:changed'; store: AppStore }
  | { type: 'account:select'; id: string }
  | { type: 'panel:open'; panel: 'settings' | 'log' }
  | { type: 'panel:close' }
  | { type: 'entry:select'; entryId: string | null }
  | { type: 'thumbnail:resize'; percent: number }
  | { type: 'backup:started'; account_id: string; total: number }
  | { type: 'backup:progress'; account_id: string; done: number; total: number; current_date: string }
  | { type: 'backup:rate_limited'; account_id: string; seconds: number }
  | { type: 'backup:completed'; account_id: string }
  | { type: 'backup:failed'; account_id: string }
  | { type: 'log:entry'; account_id: string; entry: LogEntry };

export function reducer(state: AppState, action: AppAction): AppState;
```

Implement the reducer — each action updates the relevant slice of state. The log buffer for each account keeps the 500 most recent entries in memory (older entries are on disk and fetched on demand via `getLogs`).

---

## 4. `src/context/AppContext.tsx`

```typescript
interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  backend: BackendContext;
}

export const AppContext = React.createContext<AppContextValue>(null!);
export function useApp() { return useContext(AppContext); }

export function AppProvider({
  backend,
  children,
}: {
  backend: BackendContext;
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    // Load initial store
    backend.getStore().then(store => dispatch({ type: 'store:loaded', store }));

    // Subscribe to main process events
    const unsub = backend.subscribe(event => {
      if (event.type === 'store:changed') dispatch({ type: 'store:changed', store: event.store });
      if (event.type === 'backup:event') {
        const e = event.event;
        if (e.type === 'started') dispatch({ type: 'backup:started', account_id: e.account_id, total: e.total_to_fetch });
        if (e.type === 'progress') dispatch({ type: 'backup:progress', account_id: e.account_id, done: e.done, total: e.total, current_date: e.current_date });
        if (e.type === 'rate_limited') dispatch({ type: 'backup:rate_limited', account_id: e.account_id, seconds: e.resume_in_seconds });
        if (e.type === 'completed') dispatch({ type: 'backup:completed', account_id: e.account_id });
        if (e.type === 'failed') dispatch({ type: 'backup:failed', account_id: e.account_id });
      }
      if (event.type === 'log:entry') dispatch({ type: 'log:entry', account_id: event.account_id, entry: event.entry });
    });

    return unsub;
  }, [backend]);

  return (
    <AppContext.Provider value={{ state, dispatch, backend }}>
      {children}
    </AppContext.Provider>
  );
}
```

---

## 5. Screen components

### `App.tsx`

Top-level shell. Renders:
- `<TopBar />` always
- When `store` is null (loading): centred spinner
- When `store.accounts.length === 0`: `<FirstOpenScreen />`
- Otherwise: `<div>` with sidebar + main area side by side

Main area selection:
- If `panel === 'settings'`: `<SettingsPanel />`
- If `panel === 'log'`: `<LogPanel />`
- Else if `selectedAccountId` is null or account has 0 archived: `<EmptyAccountScreen />`
- Else: `<HomeScreen />`

Panel transition animation (CSS keyframes `panelIn`):
```css
@keyframes panelIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: none; }
}
/* duration 220ms, cubic-bezier(0.22, 0.61, 0.36, 1) */
```

### `TopBar.tsx`

- `52px` tall, `var(--green-800)` background
- Left: **b-ark** wordmark (`17px / 700 / white / letter-spacing -0.01em`) + optional traffic-light dots decorative area (left-aligned, for macOS feel)
- Right: `<InfoBadge />` — the ⓘ icon button (white icon), opens an "About b-ark" popup similar to b-view's InfoPopup:
  - "b-ark is an open-source Blipfoto journal backup app, part of the **b-oss** project."
  - © year Ian Stevenson. GPLv3.
  - GitHub link (placeholder: `https://github.com/ianstevenson/b-oss`)

### `Sidebar.tsx`

- `268px` wide, full height, `1px` right border (`var(--line)`)
- Header row: `"ACCOUNTS"` label (`11px / uppercase / var(--muted)`), `Search` icon button on the right (no-op for now)
- Account rows (see below)
- Footer: full-width ghost button `"+ Add account…"` → calls `backend.addAccount()`
- When `panel !== null`: sidebar rows are `opacity: 0.45`, `pointer-events: none`

### `AccountRow.tsx`

Props: `account: AccountConfig`, `isSelected: boolean`, `isActive: boolean` (currently running backup), `progress?: BackupProgress`.

- `10px` padding, `8px` border-radius
- Selected: `var(--green-100)` background
- Avatar: `34×34` round `<img>` (use `avatar_url`); fall back to a coloured initial badge if image fails
- Journal name: `13px / 600 / var(--ink-2)`
- `@username`: `11.5px / var(--muted)`
- RAG dot: `9×9` circle, `2px white border`, colour = `var(--rag-<state>)`. When selected + green: CSS pulse animation (`opacity 0.6 → 1`, infinite, 2s ease-in-out).
- Drag handle (6 dots / `GripVertical` Lucide icon): show only on hover, `var(--muted-2)` colour. Dragging reorders the account list (update `store.ui.accountOrder` via `backend.updateAccountSettings` — or add a dedicated `reorderAccounts` call; see note below).

> **Note on account reordering**: `AccountConfig` doesn't have an `order` field — order is in `store.ui.accountOrder`. For now, implement a UI-only reorder (update local state) and call `backend.updateAccountSettings` with a no-op. A `reorderAccounts` IPC call can be added in Prompt 6. Keep the drag-to-reorder interaction correct visually even if persistence is deferred.

### `HomeScreen.tsx`

This is the main area when an account is selected and has entries.

**Header row** (`18px 24px` padding):
- Avatar (`40×40`)
- Journal name (`18px / 600`), sub-line: `@user · since DD Mmm YYYY · N entries`
- Right-side toolbar:
  - Thumbnail size group: `ZoomOut` / percentage label / `ZoomIn` / `RotateCcw` — updates `dispatch({ type: 'thumbnail:resize', ... })`
  - `LayoutGrid` icon button (placeholder, no action)
  - `FileText` icon button → `dispatch({ type: 'panel:open', panel: 'log' })`
  - `Settings` icon button → `dispatch({ type: 'panel:open', panel: 'settings' })`
  - Primary button: `"Backup now"` with `CloudDownload` icon → `backend.startBackup(accountId)`. While backup running: disabled, text `"Backing up…"`. When rate limited: show `"⏸ Rate limited — resuming in Xs"` (update every second with a countdown).

**Backup banner** (between header and grid — only visible when `backupProgress[id]?.running`):
- `var(--green-100)` background, `12px 24px` padding, `1px` bottom border `rgba(31,77,58,0.12)`
- Spinning `RefreshCw` icon (`var(--green-800)`)
- Title: `Backing up "<journal_title>"` (600, `var(--green-900)`)
- Sub: `Writing entries to <backup_folder>` (muted, mono font for path)
- Right: `220px` progress bar + `done/total` count

**Main area** (fills remaining height, `overflow-y: auto`):
- When `selectedEntryId !== null`: show `<EntryDetail>` from b-view
- Otherwise: show `<ThumbnailGrid>` from b-view

  ```tsx
  import { ThumbnailGrid, EntryDetail, useEntry } from 'b-view';
  ```

  For `ThumbnailGrid`:
  - `entries` = `journalMetadata.entries` (loaded from `journal.json` in the backup folder — see note)
  - `sizePercent` from `state.thumbnailSizePercent`
  - `onSelectEntry` → `dispatch({ type: 'entry:select', entryId })`

  For `EntryDetail`:
  - Compute `prevEntryId` / `nextEntryId` from the entries array
  - `onClose` → `dispatch({ type: 'entry:select', entryId: null })`

> **Loading journal.json inside b-ark**: The Electron main process serves the backup folder via a local HTTP server (Prompt 6). The viewer URL will be something like `http://localhost:<port>/`. The `HomeScreen` should load `journal.json` from this local server. Use `useJournal(viewerUrl + '/journal.json')` from b-view. The `viewerUrl` comes from the store (b-ark will add a field `viewer_base_url` to `AccountConfig`, or pass it via the backend; for now, derive it from `backup_folder` via IPC — add a `getViewerUrl(accountId): Promise<string>` to `BackendContext`).
>
> Simpler alternative for v1: let the `HomeScreen` always call `backend.openViewer(accountId)` to open in system browser, and show a `<ThumbnailGrid>` loaded from a URL returned by the backend. This avoids needing to pass the port into the UI. **Choose whichever approach feels cleaner and document your choice in a comment.**

**Status bar** (`38px`, `var(--bg-alt)` background, `1px` top border, `11.5px var(--muted)`):

Row of items separated by `18px` gaps:
- RAG dot + bold label ("Up to date" / "Catching up" / "Needs attention")
- `Archive` icon + bold archived count
- `Calendar` icon + "Last entry: **DD Mmm YYYY**"
- `Clock` icon + "Last backup: **<relative>** · next <scheduled>"
- Spacer
- If `error_message`: `AlertCircle` icon (red) + error message (red)
- `FileText` icon + `"View log"` link → open log panel

### `EmptyAccountScreen.tsx`

Centred card, full main area:
- `FolderOpen` icon badge (64×64, `var(--green-100)` bg, `var(--green-800)` icon, `16px` radius)
- Heading: "No blips archived yet" (`22px / 600`)
- Body: "You're set up. Run your first backup to pull every entry from Blipfoto into `<folder>`. You can leave b-ark running and it will follow your schedule."
- Buttons: "Review settings" (secondary) → open settings panel; "Run first backup" (primary) → `backend.startBackup(id)`

### `FirstOpenScreen.tsx`

Centred card, full main area (no sidebar yet):
- `Archive` icon badge (64×64, `var(--green-100)` bg, `var(--green-800)` icon, `16px` radius)
- Heading: "Welcome to b-ark" (`22px / 600`)
- Body: "b-ark keeps a local backup of your Blipfoto journals — photos, captions, comments, metadata — written to disk in folders you control."
- Primary button (lg): "+ Add account" → `backend.addAccount()`
- Footer hint (`Shield` icon): "You'll be taken to Blipfoto to authorise access in your browser."

### `OAuthSuccessScreen.tsx`

Called with props `{ account: AccountConfig }`:

Centred card, full main area:
- Green check badge (64×64, `var(--rag-green)` circle, white `Check` icon, shadow)
- Heading: "Account connected" (`22px / 600`)
- Lead: "b-ark has access to read your journal."
- Profile card (full-width inside centred column, `var(--green-50)` bg):
  - Avatar `64×64` round
  - Journal name (`16px / 600`)
  - `@handle · joined Mmm YYYY`
  - Entry count
- Buttons right-aligned: "Skip for now" (secondary) → select account, go to home; "Set up now ›" (primary) → select account, open settings

> The `OAuthSuccessScreen` is shown immediately after OAuth completes. The main process triggers a `store:changed` event with the new account; the reducer selects it automatically. A one-time flag in state (`justConnected: string | null` = account ID) triggers this screen. It clears when either button is clicked.

### `SettingsPanel.tsx`

Full main area, `max-width: 760px` centred column.

Header: `Settings` icon + "Settings · `<journal_title>`", close × icon → `dispatch({ type: 'panel:close' })`

Settings (in order, each as a block with `18px 20px` padding, `1px` bottom divider):

1. **Folder** — mono text input + "Choose…" button (`FolderOpen` icon) → `backend.pickFolder()` then update
2. **Schedule** — three sub-rows: Date (mono text input), Time (`<select>` 00:00–23:00), Every (`<select>` Daily/Weekly/Monthly)
3. **Delay** — number input (`px: 80px`) + "ms" label; description: "Pause between each entry fetch (useful to avoid bandwidth hogging during working hours). Default 0."
4. **Gap check** — number input + "days" label. Default 31.
5. **Redo** — number input + "entries" label. Default 7.
6. **Account** — two secondary buttons: "Reauthorise" (`RefreshCw` icon) → `backend.reauthoriseAccount(id)`; "Remove account" (`Trash2` icon, `var(--rag-red)` text) → confirm dialog then `backend.removeAccount(id)`

All inputs have visible focus rings: `1px var(--green-700)` + `3px rgba(31,77,58,0.12)` outer.

Changes are saved via `backend.updateAccountSettings(id, { field: value })` on blur/change (not a "Save" button — auto-save).

### `LogPanel.tsx`

Full main area.

Header: `FileText` icon + "Log · `<journal_title>`", close ×.

Toolbar row: "Filter" label + segmented control (All / Errors / Warnings / Info). Active: `var(--green-100)` bg + `var(--green-800)` text. Each non-All has a coloured dot. Right-aligned: "N of M" count.

Log table (CSS grid `22px | 92px | 1fr`, gap `10px`, `6px` vertical / `20px` horizontal padding):
- Column 1: level badge (`16px` circle: red `×` / amber `!` / blue `i` / green `✓`)
- Column 2: `HH:MM:SS` timestamp (mono, muted)
- Column 3: message (mono, ink)

Row backgrounds:
- Error: `#fdf6f5`
- Warning: `#fffaf0`
- Others: white

Load initial logs via `backend.getLogs(accountId)` on mount. Append from `state.logBuffer[accountId]` in real time (the event subscription in `AppContext` keeps this buffer up to date).

---

## 6. `src/App.tsx`

The root component. Accepts a `backend: BackendContext` prop:

```tsx
export default function App({ backend }: { backend: BackendContext }) {
  return (
    <AppProvider backend={backend}>
      <AppRoot />
    </AppProvider>
  );
}
```

`AppRoot` reads from `AppContext` and renders the appropriate screen layout.

---

## 7. `src/index.ts`

```typescript
export { default as App } from './App.js';
export type { BackendContext, AccountConfig, AppStore, LogEntry, MainEvent, BackupEvent } from './backend.js';
export { ElectronBackend } from './electron-backend.js';
```

---

## package.json

```json
{
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "lucide-react": "^0.383.0",
    "b-view": "*"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0"
  },
  "peerDependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0"
  }
}
```

---

## Acceptance criteria

- [ ] `npm run typecheck` passes with zero errors
- [ ] `App` renders without errors when provided a mock `BackendContext` returning stub data
- [ ] `BackendContext` interface has no Electron imports — the file is pure TypeScript types
- [ ] `ElectronBackend` is the only place `window.api` is referenced
- [ ] `ThumbnailGrid` and `EntryDetail` from `b-view` are imported and used correctly
- [ ] Backup banner appears when `backupProgress[id]?.running` is true
- [ ] Panel open/close animation fires (`panelIn` keyframe, 220ms)
- [ ] Sidebar rows are `opacity: 0.45 / pointer-events: none` while a panel is open
- [ ] Settings auto-save calls `backend.updateAccountSettings` on blur
- [ ] Log panel loads history on mount and streams live entries from the buffer
- [ ] RAG dot pulse animation only plays when account is selected AND `rag_state === 'green'`

## Do NOT

- Do not import from `electron` or `node:*` — zero platform dependencies
- Do not call `window.api` anywhere except `ElectronBackend`
- Do not add Redux, MobX, Zustand, or any state management library — `useReducer` + context is sufficient
- Do not implement real drag-and-drop with a library — a simple mouse-event drag is fine, or stub it visually
- Do not implement actual date pickers or calendar widgets — a plain `<input type="date">` or mono text input is sufficient for v1
- Do not add a routing library — all navigation is local `AppState.panel` and `AppState.selectedEntryId`
- Do not build the Electron main process, preload, or IPC layer — that is Prompt 6
