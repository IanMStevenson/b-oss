// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import path from 'node:path';
import { ipcMain, type BrowserWindow, dialog, shell, app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { BlipfotoClient } from '@b-oss/blipfoto-api';
import { BackupEngine, JournalIndex, LogManager } from '@b-oss/backup-engine';
import type { AccountConfig, MainEvent, LogEntry } from '@b-oss/b-ark-ui';
import { startOAuthFlow, startOAuthFlowEmbedded, encryptToken, decryptToken } from './oauth.js';
import {
  getAccounts,
  getAccount,
  saveAccount,
  deleteAccount,
  getAppStore,
  store,
} from './store.js';
import { ElectronPlatformIO } from './platform-io.js';
import { startServer, stopServer, getServerPort } from './http-server.js';
import { BackupScheduler, computeNextRun } from './scheduler.js';
import { writeBViewFiles } from './b-view-files.js';

interface BackupErrorLike {
  payload?: { kind: string };
  message?: string;
}

const activeEngines = new Map<string, BackupEngine>();

export function registerIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
  scheduler: BackupScheduler,
): void {
  function emit(event: MainEvent): void {
    getMainWindow()?.webContents.send('main-event', event);
  }

  function emitStoreChanged(): void {
    emit({ type: 'store:changed', store: getAppStore() });
  }

  async function runBackup(id: string): Promise<void> {
    const account = getAccount(id);
    if (!account) throw new Error(`Account ${id} not found`);
    if (!account.backup_folder) throw new Error('No backup folder configured');
    if (activeEngines.has(id)) return;

    const rawToken = decryptToken(account.access_token);
    const client = new BlipfotoClient(rawToken);

    const pio = new ElectronPlatformIO((level, message, accountId) => {
      const entry: LogEntry = {
        id: uuidv4(),
        account_id: accountId,
        timestamp: new Date().toISOString(),
        level,
        message,
      };
      emit({ type: 'log:entry', account_id: accountId, entry });
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

    try {
      await engine.run();

      try {
        await writeBViewFiles(account.username, account.backup_folder);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        pio.log('warn', `Failed to write b-view files: ${message}`, id);
      }

      const updated = getAccount(id);
      if (updated) {
        const journalFolder = path.join(updated.backup_folder, updated.username);
        const journal = await new JournalIndex(pio, journalFolder).load();
        saveAccount({
          ...updated,
          last_backup_at: new Date().toISOString(),
          total_archived: journal?.entries.length ?? updated.total_archived,
          journal_entry_total: journal?.entry_total ?? updated.journal_entry_total,
          rag_state: 'green',
          error_message: null,
          schedule: {
            ...updated.schedule,
            next_run: computeNextRun(updated.schedule.hour, updated.schedule.interval),
          },
        });
        const rescheduled = getAccount(id);
        if (rescheduled) scheduler.schedule(rescheduled);
        emitStoreChanged();
      }
    } catch (err) {
      const e = err as BackupErrorLike;
      const updated = getAccount(id);
      if (updated) {
        const isAuthExpired = e?.payload?.kind === 'auth_expired';
        const errorMessage = isAuthExpired
          ? 'Access token expired — reauthorise account'
          : (e?.message ?? 'Backup failed');
        saveAccount({
          ...updated,
          rag_state: isAuthExpired ? 'red' : 'amber',
          error_message: errorMessage,
        });
        if (isAuthExpired) {
          const win = getMainWindow();
          win?.show();
          win?.focus();
        }
        emitStoreChanged();
      }
    } finally {
      activeEngines.delete(id);
    }
  }

  async function performAddAccount(rawToken: string): Promise<void> {
    const client = new BlipfotoClient(rawToken);
    const profile = await client.getUserProfile({ returnDetails: true });

    // If this user already has an account configured, treat it as a reauth
    // refresh of the token rather than creating a duplicate.
    const existing = getAccounts().find((a) => a.username === profile.user.username);
    if (existing) {
      saveAccount({
        ...existing,
        access_token: encryptToken(rawToken),
        journal_entry_total: profile.details?.entry_total ?? existing.journal_entry_total,
        avatar_url: profile.user.avatar_url,
        journal_title: profile.details?.journal_title ?? existing.journal_title,
        rag_state: 'amber',
        error_message: null,
      });
      const reloaded = getAccount(existing.id);
      if (reloaded) scheduler.schedule(reloaded);
      emitStoreChanged();
      return;
    }

    const account: AccountConfig = {
      id: uuidv4(),
      username: profile.user.username,
      journal_title: profile.details?.journal_title ?? profile.user.username,
      avatar_url: profile.user.avatar_url,
      access_token: encryptToken(rawToken),
      backup_folder: '',
      schedule: {
        next_run: computeNextRun(2, 'daily'),
        hour: 2,
        interval: 'daily',
      },
      gap_check_days: 31,
      redo_count: 7,
      api_delay_ms: 0,
      last_backup_at: null,
      total_archived: 0,
      journal_entry_total: profile.details?.entry_total ?? 0,
      rag_state: 'amber',
      error_message: null,
    };

    saveAccount(account);

    const ui = store.get('ui');
    store.set('ui', { ...ui, accountOrder: [...ui.accountOrder, account.id] });

    emitStoreChanged();
  }

  ipcMain.handle('addAccount', async () => {
    const rawToken = await startOAuthFlow();
    await performAddAccount(rawToken);
  });

  ipcMain.handle('addAccountFresh', async () => {
    const rawToken = await startOAuthFlowEmbedded(getMainWindow());
    await performAddAccount(rawToken);
  });

  ipcMain.handle('removeAccount', (_event, id: string) => {
    activeEngines.get(id)?.cancel();
    activeEngines.delete(id);
    scheduler.cancel(id);
    stopServer(id);
    deleteAccount(id);
    const ui = store.get('ui');
    store.set('ui', {
      ...ui,
      accountOrder: ui.accountOrder.filter((x) => x !== id),
    });
    emitStoreChanged();
  });

  ipcMain.handle('reauthoriseAccount', async (_event, id: string) => {
    const account = getAccount(id);
    if (!account) throw new Error(`Account ${id} not found`);
    const rawToken = await startOAuthFlow();
    const client = new BlipfotoClient(rawToken);
    const profile = await client.getUserProfile({ returnDetails: true });
    saveAccount({
      ...account,
      access_token: encryptToken(rawToken),
      journal_entry_total: profile.details?.entry_total ?? account.journal_entry_total,
      rag_state: 'amber',
      error_message: null,
    });
    const reloaded = getAccount(id);
    if (reloaded) scheduler.schedule(reloaded);
    emitStoreChanged();
  });

  ipcMain.handle('startBackup', (_event, id: string) => {
    // Fire-and-forget — events are emitted via the MainEvent channel
    void runBackup(id);
  });

  ipcMain.handle('cancelBackup', (_event, id: string) => {
    activeEngines.get(id)?.cancel();
  });

  ipcMain.handle('openViewer', async (_event, id: string) => {
    const account = getAccount(id);
    if (!account?.backup_folder) return;

    let port = getServerPort(id);
    if (port === null) {
      const folder = path.join(account.backup_folder, account.username);
      port = await startServer(id, folder);
    }
    void shell.openExternal(`http://localhost:${port}/`);
  });

  ipcMain.handle('getViewerUrl', async (_event, id: string): Promise<string> => {
    const account = getAccount(id);
    if (!account?.backup_folder) return '';
    let port = getServerPort(id);
    if (port === null) {
      const folder = path.join(account.backup_folder, account.username);
      port = await startServer(id, folder);
    }
    return `http://localhost:${port}`;
  });

  ipcMain.handle('pickFolder', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle(
    'updateAccountSettings',
    (_event, id: string, settings: Partial<AccountConfig>) => {
      const account = getAccount(id);
      if (!account) throw new Error(`Account ${id} not found`);
      const updated: AccountConfig = { ...account, ...settings };
      saveAccount(updated);
      scheduler.schedule(updated);
      app.setLoginItemSettings({ openAtLogin: store.get('app').startWithWindows });
      emitStoreChanged();
    },
  );

  ipcMain.handle('getStore', () => getAppStore());

  ipcMain.handle('getLogs', async (_event, id: string): Promise<LogEntry[]> => {
    const account = getAccount(id);
    if (!account?.backup_folder) return [];
    const folder = path.join(account.backup_folder, account.username);
    const pio = new ElectronPlatformIO(() => {
      /* silent — read-only access */
    });
    const logMgr = new LogManager(pio, folder);
    return logMgr.readAll();
  });

  // Re-export for use from main.ts (scheduled run trigger)
  schedulerRunner = runBackup;
  // touch getAccounts to avoid unused import in some build modes
  void getAccounts;
}

// Set by registerIpcHandlers, used by main.ts to wire the scheduler callback.
let schedulerRunner: ((id: string) => Promise<void>) | null = null;

export function triggerScheduledBackup(id: string): void {
  if (schedulerRunner) {
    void schedulerRunner(id);
  }
}
