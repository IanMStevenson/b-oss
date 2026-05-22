// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import path from 'node:path';
import { app, BrowserWindow, Menu, nativeImage, session } from 'electron';
import { handleOAuthCallback } from './oauth.js';
import { registerIpcHandlers, triggerScheduledBackup } from './ipc-handlers.js';
import { createTray } from './tray.js';
import { setupAutoUpdater } from './updater.js';
import { BackupScheduler } from './scheduler.js';
import { stopAllServers } from './http-server.js';
import { getAccounts, store } from './store.js';

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

const scheduler = new BackupScheduler((accountId) => {
  triggerScheduledBackup(accountId);
});

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
    minWidth: 900,
    minHeight: 600,
    icon: nativeImage.createFromPath(iconPath),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
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

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devServerUrl) {
    void win.loadURL(devServerUrl);
    win.webContents.openDevTools();
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return win;
}

void app.whenReady().then(() => {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  const csp = devServerUrl
    ? // Dev: Vite injects inline scripts for HMR and opens a websocket back
      // to the dev server, so loosen script-src/connect-src accordingly.
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
      "style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; " +
      `connect-src 'self' ${devServerUrl} ws://${new URL(devServerUrl).host} http://localhost:*;`
    : // Prod: strict policy — only same-origin scripts, no inline.
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data: https:; connect-src 'self' http://localhost:*;";

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  mainWindow = createWindow();

  createTray(() => mainWindow);
  registerIpcHandlers(() => mainWindow, scheduler);
  setupAutoUpdater();

  for (const account of getAccounts()) {
    scheduler.schedule(account);
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
  scheduler.cancelAll();
  stopAllServers();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
