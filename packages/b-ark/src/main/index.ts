// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import path from 'node:path';
import { app, BrowserWindow, Menu, nativeImage, session, shell } from 'electron';
import { handleOAuthCallback } from './oauth.js';
import {
  registerIpcHandlers,
  triggerScheduledBackup,
  queueAutoResume,
  hasIncompleteFirstBackup,
  advanceSharedNextRun,
} from './ipc-handlers.js';
import { createTray } from './tray.js';
import { setupAutoUpdater } from './updater.js';
import { BackupScheduler } from './scheduler.js';
import { stopAllServers } from './http-server.js';
import {
  getAccounts,
  store,
  loadPortableFromStoredFolder,
  getPortableSettings,
  ensureAppDefaults,
} from './store.js';
import { migrateFromV1IfNeeded } from './migrate-store.js';

// Name shown in OS dialogs ("Open b-ark?"), taskbar tooltip, userData dir, etc.
// In packaged builds electron-builder sets this from productName; in dev we
// override the default 'Electron' here.
app.setName('b-ark');

// In dev, Vite HMR requires 'unsafe-eval' in the renderer CSP. Electron's
// built-in security checker correctly flags this and prints a console warning
// on every reload — noise that masks any real regression. Suppress it only
// when running against the dev server; the packaged build uses a strict CSP
// and this env var has no effect there.
if (process.env['ELECTRON_RENDERER_URL']) {
  process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
}
// Point the cache to a stable subdirectory of userData so Electron can always
// create/rename it without hitting Windows access-denied errors (0x5).
app.setPath('cache', path.join(app.getPath('userData'), 'cache'));

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

if (process.defaultApp) {
  // Development — register protocol with full argv to support reinvocation
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('b-ark', process.execPath, [
      path.resolve(process.argv[1] ?? ''),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient('b-ark');
}

app.isQuitting = false;

let mainWindow: BrowserWindow | null = null;

const scheduler = new BackupScheduler(
  () => getPortableSettings().schedule,
  () => getPortableSettings().account_order,
  (id) => triggerScheduledBackup(id),
  () => advanceSharedNextRun(),
);

function createWindow(): BrowserWindow {
  // Suppress the default File/Edit/View/Window menu bar on all platforms.
  // The macOS application menu (different beast) is left alone.
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
  }

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'resources', 'icon.ico')
    : path.join(__dirname, '../../resources/icon.ico');

  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 550,
    minHeight: 600,
    icon: nativeImage.createFromPath(iconPath),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Belt-and-braces: the renderer should never navigate the main window to
  // anything other than the local app shell. If a future refactor accidentally
  // introduces an <a href> or location.href to an external URL, divert it to
  // the OS browser instead of letting the main window load remote content.
  const devServerOrigin = process.env['ELECTRON_RENDERER_URL']
    ? new URL(process.env['ELECTRON_RENDERER_URL']).origin
    : null;
  const blockNonLocal = (event: Electron.Event, url: string): void => {
    if (url.startsWith('file://')) return;
    try {
      if (devServerOrigin && new URL(url).origin === devServerOrigin) return;
    } catch {
      // malformed URL — fall through to block
    }
    event.preventDefault();
    void shell.openExternal(url);
  };
  win.webContents.on('will-navigate', (event, url) => blockNonLocal(event, url));
  win.webContents.on('will-redirect', (event, url) => blockNonLocal(event, url));

  win.once('ready-to-show', () => win.show());

  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devServerUrl) {
    void win.loadURL(devServerUrl);
    win.webContents.openDevTools();
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return win;
}

void app.whenReady().then(async () => {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  const csp = devServerUrl
    ? // Dev: Vite injects inline scripts for HMR and opens a websocket back
      // to the dev server, so loosen script-src/connect-src accordingly.
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
      "style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http://localhost:*; " +
      `connect-src 'self' ${devServerUrl} ws://${new URL(devServerUrl).host} http://localhost:*;`
    : // Prod: strict policy — only same-origin scripts, no inline.
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https: http://localhost:*; connect-src 'self' http://localhost:*;";

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  // Storage layer must be ready before any IPC handler or scheduler runs.
  await migrateFromV1IfNeeded();
  ensureAppDefaults();
  await loadPortableFromStoredFolder();

  mainWindow = createWindow();

  createTray(() => mainWindow, store);
  registerIpcHandlers(() => mainWindow, scheduler);
  setupAutoUpdater();

  scheduler.rearm();

  for (const account of getAccounts()) {
    if (await hasIncompleteFirstBackup(account)) {
      queueAutoResume(account.id);
    }
  }

  app.setLoginItemSettings({ openAtLogin: store.get('app').startWithWindows });
});

app.on('second-instance', (_event, argv) => {
  const uri = argv.find((arg) => arg.startsWith('b-ark://'));
  if (uri) handleOAuthCallback(uri);
  mainWindow?.show();
  mainWindow?.focus();
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  handleOAuthCallback(url);
});

app.on('before-quit', () => {
  app.isQuitting = true;
  scheduler.cancel();
  stopAllServers();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
