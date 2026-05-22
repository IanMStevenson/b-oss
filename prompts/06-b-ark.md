# Prompt 6 — `packages/b-ark`

## Context

You are building **b-oss**. All five earlier packages are complete. You are now building `b-ark` — the Electron shell that wires everything together into a shippable desktop app.

This package is the only one that may use Electron and Node.js APIs. It provides:
- `ElectronPlatformIO` — implements `PlatformIO` from `backup-engine` using Node `fs/promises`
- The Electron main process (OAuth, scheduling, tray, IPC, local HTTP server, auto-update)
- The preload script (safe contextBridge exposure of `window.api`)
- `electron-vite` build config
- `electron-builder` packaging config (Windows NSIS, no-admin, per-user install)

---

## ⚠️ IMPORTANT — Client ID setup

**Before running b-ark for the first time**, you must:

1. Register b-ark at `https://www.blipfoto.com/developer/apps` as a **Distributed App** type
2. Set the redirect URI to `b-ark://oauth/callback` (or `b-ark://oauth/*`)
3. Copy your Client ID into `.env.local` at the repo root:
   ```
   BLIPFOTO_CLIENT_ID=your_client_id_here
   ```
4. Never commit `.env.local` — it is in `.gitignore`

The client ID is loaded in the main process via `import.meta.env.VITE_BLIPFOTO_CLIENT_ID` (electron-vite exposes Vite env vars prefixed `VITE_` to the main process). This means `.env.local` must set `VITE_BLIPFOTO_CLIENT_ID`. The `.env.example` at the repo root already shows this format.

---

## Package location

`packages/b-ark/`

---

## File structure

```
packages/b-ark/
  src/
    main/
      main.ts               # Electron main process entry
      platform-io.ts        # ElectronPlatformIO (implements PlatformIO)
      ipc-handlers.ts       # IPC handler registration
      oauth.ts              # OAuth flow helpers
      scheduler.ts          # BackupScheduler
      store.ts              # electron-store setup + typed accessors
      http-server.ts        # local HTTP server for b-view
      tray.ts               # system tray setup
      updater.ts            # electron-updater setup
    preload/
      preload.ts            # contextBridge exposure
    renderer/
      index.html            # Vite entry HTML
      main.tsx              # React entry point (mounts b-ark-ui App)
  electron-builder.config.json
  vite.config.ts            # electron-vite config
  package.json
```

---

## 1. Vite config (`vite.config.ts`)

```typescript
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/main.ts') },
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/preload.ts') },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
    plugins: [react()],
  },
});
```

---

## 2. `src/main/store.ts` — electron-store setup

```typescript
import Store from 'electron-store';
import type { AppStore, AccountConfig } from 'b-ark-ui';

const defaults: AppStore = {
  accounts: [],
  ui: { thumbnailSizePercent: 100, accountOrder: [] },
  app: { startWithWindows: false },
};

export const store = new Store<AppStore>({ defaults });

// Typed accessors
export function getAccounts(): AccountConfig[] {
  return store.get('accounts');
}

export function getAccount(id: string): AccountConfig | undefined {
  return getAccounts().find(a => a.id === id);
}

export function saveAccount(account: AccountConfig): void {
  const accounts = getAccounts().filter(a => a.id !== account.id);
  accounts.push(account);
  store.set('accounts', accounts);
}

export function deleteAccount(id: string): void {
  store.set('accounts', getAccounts().filter(a => a.id !== id));
}

export function getAppStore(): AppStore {
  return store.store;
}
```

---

## 3. `src/main/oauth.ts` — OAuth flow

### How the flow works (Blipfoto distributed app implicit grant):

1. Generate a random `state` string (CSRF token) — use `crypto.randomUUID()`
2. Open the system browser with:
   ```
   https://www.blipfoto.com/oauth/authorize
     ?response_type=token
     &client_id=<VITE_BLIPFOTO_CLIENT_ID>
     &redirect_uri=b-ark://oauth/callback
     &scope=read
     &state=<state>
   ```
3. Blipfoto redirects to `b-ark://oauth/callback#access_token=TOKEN&token_type=bearer&state=STATE&...`
4. The OS invokes b-ark via `second-instance` (Windows/Linux) or `open-url` (macOS) event
5. Extract the `state` from the URL, validate it matches the pending state
6. Extract `access_token` from the URL fragment
7. Encrypt the token and store it

```typescript
import { shell, safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';

let pendingState: string | null = null;
let pendingResolve: ((token: string) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;

const CLIENT_ID = import.meta.env.VITE_BLIPFOTO_CLIENT_ID as string;

export function startOAuthFlow(): Promise<string> {
  if (!CLIENT_ID) throw new Error('VITE_BLIPFOTO_CLIENT_ID is not set in .env.local');

  return new Promise((resolve, reject) => {
    pendingState = randomUUID();
    pendingResolve = resolve;
    pendingReject = reject;

    const url = new URL('https://www.blipfoto.com/oauth/authorize');
    url.searchParams.set('response_type', 'token');
    url.searchParams.set('client_id', CLIENT_ID);
    url.searchParams.set('redirect_uri', 'b-ark://oauth/callback');
    url.searchParams.set('scope', 'read');
    url.searchParams.set('state', pendingState);

    shell.openExternal(url.toString());
  });
}

/**
 * Call this when a b-ark:// URI is intercepted (from second-instance or open-url).
 * Returns the decrypted access token, or throws on failure.
 */
export function handleOAuthCallback(uri: string): void {
  try {
    // Fragment is after '#'
    const hashIndex = uri.indexOf('#');
    if (hashIndex === -1) throw new Error('No fragment in OAuth callback URI');
    const fragment = new URLSearchParams(uri.slice(hashIndex + 1));

    const returnedState = fragment.get('state');
    if (returnedState !== pendingState) throw new Error('OAuth state mismatch — possible CSRF');

    const accessToken = fragment.get('access_token');
    if (!accessToken) throw new Error('No access_token in OAuth callback');

    pendingResolve?.(accessToken);
  } catch (err) {
    pendingReject?.(err as Error);
  } finally {
    pendingState = null;
    pendingResolve = null;
    pendingReject = null;
  }
}

export function encryptToken(token: string): string {
  return safeStorage.encryptString(token).toString('base64');
}

export function decryptToken(encrypted: string): string {
  return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
}
```

---

## 4. `src/main/platform-io.ts` — ElectronPlatformIO

Implements `PlatformIO` from `backup-engine` using Node.js APIs:

```typescript
import fs from 'node:fs/promises';
import path from 'node:path';
import type { PlatformIO } from 'backup-engine';
import { net } from 'electron';

export class ElectronPlatformIO implements PlatformIO {
  private readonly logHandler: (level: 'info' | 'warn' | 'error', message: string, accountId: string) => void;

  constructor(logHandler: ElectronPlatformIO['logHandler']) {
    this.logHandler = logHandler;
  }

  async readFile(p: string): Promise<Buffer> {
    return fs.readFile(p);
  }

  async writeFile(p: string, data: Buffer | string): Promise<void> {
    await fs.writeFile(p, data);
  }

  async ensureDir(p: string): Promise<void> {
    await fs.mkdir(p, { recursive: true });
  }

  async fileExists(p: string): Promise<boolean> {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }

  async listDir(p: string): Promise<string[]> {
    try {
      return await fs.readdir(p);
    } catch {
      return [];
    }
  }

  async deleteFile(p: string): Promise<void> {
    await fs.unlink(p);
  }

  async downloadFile(url: string, destPath: string): Promise<void> {
    // Use Electron's net module for downloads (respects system proxy settings)
    const response = await net.fetch(url);
    if (!response.ok) throw new Error(`Download failed ${response.status}: ${url}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(destPath, buffer);
  }

  log(level: 'info' | 'warn' | 'error', message: string, accountId: string): void {
    this.logHandler(level, message, accountId);
  }
}
```

---

## 5. `src/main/http-server.ts` — local HTTP server for b-view

```typescript
import http from 'node:http';
import handler from 'serve-handler';

const servers = new Map<string, { server: http.Server; port: number }>();

export async function startServer(accountId: string, backupFolder: string): Promise<number> {
  stopServer(accountId);

  const port = await getFreePort();
  const server = http.createServer((req, res) => {
    handler(req, res, { public: backupFolder });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });

  servers.set(accountId, { server, port });
  return port;
}

export function stopServer(accountId: string): void {
  const existing = servers.get(accountId);
  if (existing) {
    existing.server.close();
    servers.delete(accountId);
  }
}

export function getServerPort(accountId: string): number | null {
  return servers.get(accountId)?.port ?? null;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = http.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as { port: number };
      srv.close(() => resolve(addr.port));
    });
    srv.on('error', reject);
  });
}
```

---

## 6. `src/main/scheduler.ts` — BackupScheduler

```typescript
export class BackupScheduler {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly onRun: (accountId: string) => void,
  ) {}

  /** Schedule (or reschedule) the backup for an account. Call on startup and after settings change. */
  schedule(account: AccountConfig): void {
    this.cancel(account.id);

    const nextRun = new Date(account.schedule.next_run).getTime();
    const now = Date.now();
    const delay = nextRun - now;

    if (delay <= 0) {
      // Overdue — run immediately
      setImmediate(() => this.onRun(account.id));
    } else {
      // Schedule for the future
      const timer = setTimeout(() => {
        this.onRun(account.id);
        // After running, schedule the next occurrence
        // (the main process updates next_run in the store after each run)
      }, Math.min(delay, 2_147_483_647)); // setTimeout max ~24.8 days
      this.timers.set(account.id, timer);
    }
  }

  cancel(accountId: string): void {
    const timer = this.timers.get(accountId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(accountId);
    }
  }

  cancelAll(): void {
    for (const id of this.timers.keys()) this.cancel(id);
  }
}
```

**Computing `next_run` after a completed backup:**

```typescript
function computeNextRun(hour: number, interval: 'daily' | 'weekly' | 'monthly'): string {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);

  if (next <= now) {
    if (interval === 'daily') next.setDate(next.getDate() + 1);
    else if (interval === 'weekly') next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1);
  }

  return next.toISOString();
}
```

---

## 7. `src/main/tray.ts` — system tray

```typescript
import { Tray, Menu, nativeImage, app, BrowserWindow } from 'electron';
import path from 'node:path';

export function createTray(getWindow: () => BrowserWindow | null): Tray {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, '../../resources/tray-icon.png'),
  );
  const tray = new Tray(icon);

  tray.setToolTip('b-ark');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open b-ark', click: () => getWindow()?.show() },
    { type: 'separator' },
    { label: 'Exit', click: () => { app.isQuitting = true; app.quit(); } },
  ]));

  tray.on('double-click', () => getWindow()?.show());

  return tray;
}
```

Create a `resources/tray-icon.png` (16×16 or 22×22 pixels, green archive icon — a placeholder PNG is fine; replace with a real icon before release).

Extend the Electron `App` type:
```typescript
declare module 'electron' {
  interface App { isQuitting: boolean; }
}
app.isQuitting = false;
```

---

## 8. `src/main/updater.ts` — auto-update

```typescript
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';

export function setupAutoUpdater(): void {
  autoUpdater.logger = log;
  (autoUpdater.logger as typeof log).transports.file.level = 'info';
  autoUpdater.checkForUpdatesAndNotify();
}
```

Auto-update only works in production builds. It is a no-op in development.

---

## 9. `src/main/ipc-handlers.ts` — IPC registration

Register all `ipcMain.handle()` calls. The handlers implement the full `window.api` surface.

```typescript
import { ipcMain, BrowserWindow, dialog, shell, app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { BlipfotoClient } from 'blipfoto-api';
import { BackupEngine } from 'backup-engine';
import type { AccountConfig, MainEvent } from 'b-ark-ui';
import { startOAuthFlow, handleOAuthCallback, encryptToken, decryptToken } from './oauth.js';
import { getAccounts, getAccount, saveAccount, deleteAccount, getAppStore, store } from './store.js';
import { ElectronPlatformIO } from './platform-io.js';
import { startServer, getServerPort } from './http-server.js';
import { BackupScheduler } from './scheduler.js';
import { computeNextRun } from './scheduler.js';

// Active backup engines (one per running backup)
const activeEngines = new Map<string, BackupEngine>();

export function registerIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
  scheduler: BackupScheduler,
): void {

  /** Broadcast a MainEvent to the renderer */
  function emit(event: MainEvent): void {
    getMainWindow()?.webContents.send('main-event', event);
  }

  function emitStoreChanged(): void {
    emit({ type: 'store:changed', store: getAppStore() });
  }

  // ── addAccount ──────────────────────────────────────────────────────────────
  ipcMain.handle('addAccount', async () => {
    const rawToken = await startOAuthFlow();
    // Get user profile to fill in account details
    const client = new BlipfotoClient(rawToken);
    const { user, details } = await client.getUserProfile({ returnDetails: true });

    const account: AccountConfig = {
      id: uuidv4(),
      username: user.username,
      journal_title: details?.journal_title ?? user.username,
      avatar_url: user.avatar_url,
      access_token: encryptToken(rawToken),
      backup_folder: '',    // user must choose in settings
      schedule: {
        next_run: computeNextRun(2, 'daily'), // default: 2am daily
        hour: 2,
        interval: 'daily',
      },
      gap_check_days: 31,
      redo_count: 7,
      api_delay_ms: 0,
      last_backup_at: null,
      total_archived: 0,
      rag_state: 'amber',
      error_message: null,
    };

    saveAccount(account);

    // Update accountOrder
    const ui = store.get('ui');
    store.set('ui', { ...ui, accountOrder: [...ui.accountOrder, account.id] });

    emitStoreChanged();
    // Caller (renderer) shows OAuthSuccessScreen based on the new account appearing in the store
  });

  // ── removeAccount ────────────────────────────────────────────────────────────
  ipcMain.handle('removeAccount', async (_event, id: string) => {
    activeEngines.get(id)?.cancel();
    activeEngines.delete(id);
    scheduler.cancel(id);
    deleteAccount(id);
    const ui = store.get('ui');
    store.set('ui', { ...ui, accountOrder: ui.accountOrder.filter((x: string) => x !== id) });
    emitStoreChanged();
  });

  // ── reauthoriseAccount ───────────────────────────────────────────────────────
  ipcMain.handle('reauthoriseAccount', async (_event, id: string) => {
    const account = getAccount(id);
    if (!account) throw new Error(`Account ${id} not found`);
    const rawToken = await startOAuthFlow();
    saveAccount({ ...account, access_token: encryptToken(rawToken), rag_state: 'amber', error_message: null });
    scheduler.schedule(getAccount(id)!);
    emitStoreChanged();
  });

  // ── startBackup ──────────────────────────────────────────────────────────────
  ipcMain.handle('startBackup', async (_event, id: string) => {
    const account = getAccount(id);
    if (!account) throw new Error(`Account ${id} not found`);
    if (!account.backup_folder) throw new Error('No backup folder configured');
    if (activeEngines.has(id)) return; // already running

    const rawToken = decryptToken(account.access_token);
    const client = new BlipfotoClient(rawToken);

    const pio = new ElectronPlatformIO((level, message, accountId) => {
      const entry = { id: uuidv4(), account_id: accountId, timestamp: new Date().toISOString(), level, message };
      emit({ type: 'log:entry', account_id: accountId, entry });
      // Also append to log file — ElectronPlatformIO's log method handles file I/O indirectly;
      // the LogManager is used inside BackupEngine. This callback just streams to UI.
    });

    const engine = new BackupEngine(
      {
        id: account.id,
        username: account.username,
        journal_title: account.journal_title,
        avatar_url: account.avatar_url,
        access_token: rawToken,
        backup_folder: account.backup_folder,
        redo_count: account.redo_count,
        gap_check_days: account.gap_check_days,
        api_delay_ms: account.api_delay_ms,
        app_version: app.getVersion(),
      },
      pio,
      client,
      (event) => emit({ type: 'backup:event', event }),
    );

    activeEngines.set(id, engine);

    engine.run()
      .then(() => {
        // Update store after successful backup
        const updated = getAccount(id)!;
        saveAccount({
          ...updated,
          last_backup_at: new Date().toISOString(),
          rag_state: 'green',
          error_message: null,
          schedule: {
            ...updated.schedule,
            next_run: computeNextRun(updated.schedule.hour, updated.schedule.interval),
          },
        });
        scheduler.schedule(getAccount(id)!);
        emitStoreChanged();
      })
      .catch((err) => {
        const updated = getAccount(id);
        if (updated) {
          const errorMessage =
            err?.payload?.kind === 'auth_expired'
              ? 'Access token expired — reauthorise account'
              : err?.message ?? 'Backup failed';
          saveAccount({
            ...updated,
            rag_state: err?.payload?.kind === 'auth_expired' ? 'red' : 'amber',
            error_message: errorMessage,
          });
          // If token expired, bring window to foreground
          if (err?.payload?.kind === 'auth_expired') {
            getMainWindow()?.show();
            getMainWindow()?.focus();
          }
          emitStoreChanged();
        }
      })
      .finally(() => {
        activeEngines.delete(id);
      });
  });

  // ── cancelBackup ─────────────────────────────────────────────────────────────
  ipcMain.handle('cancelBackup', async (_event, id: string) => {
    activeEngines.get(id)?.cancel();
  });

  // ── openViewer ───────────────────────────────────────────────────────────────
  ipcMain.handle('openViewer', async (_event, id: string) => {
    const account = getAccount(id);
    if (!account?.backup_folder) return;

    let port = getServerPort(id);
    if (!port) {
      const folder = require('node:path').join(account.backup_folder, account.username);
      port = await startServer(id, folder);
    }
    shell.openExternal(`http://localhost:${port}/`);
  });

  // ── pickFolder ───────────────────────────────────────────────────────────────
  ipcMain.handle('pickFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  // ── updateAccountSettings ────────────────────────────────────────────────────
  ipcMain.handle('updateAccountSettings', async (_event, id: string, settings: Partial<AccountConfig>) => {
    const account = getAccount(id);
    if (!account) throw new Error(`Account ${id} not found`);
    const updated = { ...account, ...settings };
    saveAccount(updated);
    scheduler.schedule(updated);
    emitStoreChanged();
  });

  // ── getStore ─────────────────────────────────────────────────────────────────
  ipcMain.handle('getStore', async () => getAppStore());

  // ── getLogs ──────────────────────────────────────────────────────────────────
  ipcMain.handle('getLogs', async (_event, id: string) => {
    const account = getAccount(id);
    if (!account?.backup_folder) return [];

    const { LogManager } = await import('backup-engine');
    const folder = require('node:path').join(account.backup_folder, account.username);
    const pio = new ElectronPlatformIO(() => {});
    const logMgr = new LogManager(pio, folder);
    return logMgr.readAll();
  });

  // ── getViewerUrl ─────────────────────────────────────────────────────────────
  ipcMain.handle('getViewerUrl', async (_event, id: string) => {
    const account = getAccount(id);
    if (!account?.backup_folder) return null;
    let port = getServerPort(id);
    if (!port) {
      const folder = require('node:path').join(account.backup_folder, account.username);
      port = await startServer(id, folder);
    }
    return `http://localhost:${port}`;
  });
}
```

---

## 10. `src/main/main.ts` — main process entry

```typescript
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { handleOAuthCallback } from './oauth.js';
import { registerIpcHandlers } from './ipc-handlers.js';
import { createTray } from './tray.js';
import { setupAutoUpdater } from './updater.js';
import { BackupScheduler } from './scheduler.js';
import { getAccounts } from './store.js';

// Enforce single instance
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// Register custom protocol
app.setAsDefaultProtocolClient('b-ark');

let mainWindow: BrowserWindow | null = null;

const scheduler = new BackupScheduler((accountId) => {
  ipcMain.emit('startBackup-internal', accountId);
});

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  win.once('ready-to-show', () => win.show());

  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return win;
}

app.whenReady().then(() => {
  mainWindow = createWindow();

  createTray(() => mainWindow);
  registerIpcHandlers(() => mainWindow, scheduler);
  setupAutoUpdater();

  // Schedule all accounts
  for (const account of getAccounts()) {
    scheduler.schedule(account);
  }

  // Start with Windows registry
  const { store } = await import('./store.js');
  if (store.get('app.startWithWindows')) {
    app.setLoginItemSettings({ openAtLogin: true });
  }
});

// Handle OAuth callback — Windows/Linux (second instance)
app.on('second-instance', (_event, argv) => {
  const uri = argv.find(arg => arg.startsWith('b-ark://'));
  if (uri) handleOAuthCallback(uri);
  mainWindow?.show();
  mainWindow?.focus();
});

// Handle OAuth callback — macOS
app.on('open-url', (_event, url) => {
  handleOAuthCallback(url);
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
```

---

## 11. `src/preload/preload.ts`

```typescript
import { contextBridge, ipcRenderer } from 'electron';
import type { AccountConfig, MainEvent } from 'b-ark-ui';

contextBridge.exposeInMainWorld('api', {
  addAccount: () => ipcRenderer.invoke('addAccount'),
  removeAccount: (id: string) => ipcRenderer.invoke('removeAccount', id),
  reauthoriseAccount: (id: string) => ipcRenderer.invoke('reauthoriseAccount', id),
  startBackup: (id: string) => ipcRenderer.invoke('startBackup', id),
  cancelBackup: (id: string) => ipcRenderer.invoke('cancelBackup', id),
  openViewer: (id: string) => ipcRenderer.invoke('openViewer', id),
  pickFolder: () => ipcRenderer.invoke('pickFolder'),
  updateAccountSettings: (id: string, settings: Partial<AccountConfig>) =>
    ipcRenderer.invoke('updateAccountSettings', id, settings),
  getStore: () => ipcRenderer.invoke('getStore'),
  getLogs: (id: string) => ipcRenderer.invoke('getLogs', id),
  getViewerUrl: (id: string) => ipcRenderer.invoke('getViewerUrl', id),
  on: (channel: string, handler: (event: MainEvent) => void) => {
    if (channel !== 'main-event') throw new Error('Unknown channel: ' + channel);
    const listener = (_event: Electron.IpcRendererEvent, data: MainEvent) => handler(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
```

---

## 12. `src/renderer/main.tsx` — renderer entry

```typescript
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App, ElectronBackend } from 'b-ark-ui';

const backend = new ElectronBackend();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App backend={backend} />
  </React.StrictMode>
);
```

---

## 13. `src/renderer/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'self';
    script-src 'self';
    style-src 'self' 'unsafe-inline';
    img-src 'self' data: https:;
    connect-src 'self' http://localhost:*;
  " />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>b-ark</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/main.tsx"></script>
</body>
</html>
```

---

## 14. `electron-builder.config.json`

```json
{
  "appId": "co.salientpoint.b-ark",
  "productName": "b-ark",
  "copyright": "Copyright © 2026 Ian Stevenson",
  "directories": {
    "output": "dist-electron"
  },
  "files": [
    "out/**/*"
  ],
  "extraResources": [
    { "from": "resources/", "to": "resources/" }
  ],
  "win": {
    "target": [
      { "target": "nsis", "arch": ["x64"] }
    ],
    "icon": "resources/icon.ico"
  },
  "nsis": {
    "oneClick": false,
    "allowToChangeInstallationDirectory": true,
    "perMachine": false,
    "installerIcon": "resources/icon.ico",
    "uninstallerIcon": "resources/icon.ico",
    "runAfterFinish": true
  },
  "mac": {
    "target": "dmg",
    "icon": "resources/icon.icns",
    "category": "public.app-category.productivity",
    "hardenedRuntime": true,
    "entitlements": "resources/entitlements.mac.plist",
    "entitlementsInherit": "resources/entitlements.mac.plist"
  },
  "publish": [
    {
      "provider": "github",
      "owner": "ianstevenson",
      "repo": "b-oss"
    }
  ]
}
```

---

## 15. package.json (key additions)

```json
{
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "pack": "npm run build && electron-builder --dir",
    "dist": "npm run build && electron-builder",
    "dist:win": "npm run build && electron-builder --win",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "b-ark-ui": "*",
    "backup-engine": "*",
    "blipfoto-api": "*",
    "b-view": "*",
    "electron-store": "^8.0.0",
    "electron-updater": "^6.0.0",
    "electron-log": "^5.0.0",
    "serve-handler": "^6.1.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "electron": "^30.0.0",
    "electron-vite": "^2.0.0",
    "electron-builder": "^24.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "@types/serve-handler": "^6.0.0",
    "@types/uuid": "^9.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0"
  }
}
```

---

## 16. b-view SPA bundling

After a successful backup, b-ark should write the b-view SPA into the backup folder so users can browse locally. Add a function `writeBViewFiles(username: string, backupFolder: string)`:

```typescript
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Copy the b-view dist/ folder into <backupFolder>/<username>/
 * so the user can open index.html via b-ark's local HTTP server or deploy to a web host.
 */
export async function writeBViewFiles(username: string, backupFolder: string): Promise<void> {
  const bviewDist = path.join(__dirname, '../../b-view/dist');
  const dest = path.join(backupFolder, username);

  // Recursively copy all files from bviewDist to dest
  await copyDir(bviewDist, dest);
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
```

Call `writeBViewFiles` from the `startBackup` handler after `engine.run()` resolves successfully.

> **Build dependency**: `packages/b-view` must be built (`npm run build --workspace=packages/b-view`) before b-ark can be packaged, so that `b-view/dist/` exists. The `scripts/setup.js` created in Prompt 1 should be updated to include this step. Also add to the CI workflow.

---

## 17. Start-with-Windows setting

In the settings panel, when "Start with Windows" is toggled:
```typescript
// In the ipcMain handler for updateAccountSettings (or a dedicated setStartWithWindows handler):
app.setLoginItemSettings({ openAtLogin: store.get('app.startWithWindows') });
```

This writes to `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` — no admin required.

---

## Acceptance criteria

- [ ] `npm run dev --workspace=packages/b-ark` launches Electron with the b-ark-ui rendered
- [ ] `npm run typecheck` passes with zero errors
- [ ] OAuth flow: clicking "+ Add account" opens the system browser; returning to the app with a `b-ark://` URI completes the flow
- [ ] `VITE_BLIPFOTO_CLIENT_ID` is clearly logged as missing with a helpful error if `.env.local` is not set
- [ ] Backup starts, emits progress events, completes, writes `journal.json`, deletes checkpoint
- [ ] After successful backup, b-view files are written to the backup folder
- [ ] Local HTTP server starts and serves the backup folder; "Open viewer" opens it in the system browser
- [ ] Scheduler reschedules after each completed backup; overdue runs fire on startup
- [ ] Window hides to tray on close; tray double-click shows it; "Exit" fully quits
- [ ] Token expiry during backup brings the window to foreground and sets RAG red
- [ ] `npm run dist:win` produces a working NSIS installer in `dist-electron/`

## Do NOT

- Do not expose Node APIs to the renderer except via `contextBridge` — `nodeIntegration: false` is mandatory
- Do not store the raw access token in logs, IPC messages, or the renderer — always pass only the account ID and let the main process decrypt on demand
- Do not hardcode the Blipfoto client ID — always read from `import.meta.env.VITE_BLIPFOTO_CLIENT_ID`
- Do not implement the b-view standalone SPA here — it is built by the b-view package (Prompt 4) and only copied by b-ark
- Do not implement port selection logic beyond picking a free port — no need for a fixed port
- Do not use `require()` for packages that have ES module exports — use dynamic `import()` if needed in CommonJS contexts, or configure electron-vite to handle it
