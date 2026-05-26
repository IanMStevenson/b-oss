// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import path from 'node:path';
import fs from 'node:fs';
import { ipcMain, type BrowserWindow, dialog, shell, app } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { BlipfotoClient } from '@b-oss/blipfoto-api';
import { BackupEngine, JournalIndex, LogManager } from '@b-oss/backup-engine';
import type {
  AccountConfig,
  BootState,
  LogEntry,
  MainEvent,
  SharedSettingsPartial,
} from '@b-oss/b-ark-ui';
import { startOAuthFlow, startOAuthFlowEmbedded, encryptToken, decryptToken } from './oauth.js';
import {
  getAccounts,
  getAccount,
  saveAccount,
  deleteAccount,
  getAppStore,
  getBackupFolder,
  getPortableSettings,
  savePortableSettings,
  bindBackupFolder,
  store as userDataStore,
} from './store.js';
import { ElectronPlatformIO } from './platform-io.js';
import { startServer, stopServer, getServerPort } from './http-server.js';
import { BackupScheduler, computeNextRun } from './scheduler.js';
import { writeBViewFiles } from './b-view-files.js';
import { toCsv } from './log-csv.js';
import { rebuildTrayMenu } from './tray.js';

interface BackupErrorLike {
  payload?: { kind: string };
  message?: string;
}

const activeEngines = new Map<string, BackupEngine>();

// Shared in-flight promise map: manual and scheduled callers awaiting the
// same id resolve from the same promise rather than racing or skipping.
const inFlightRuns = new Map<string, Promise<void>>();

const pendingAutoResume = new Set<string>();

export function queueAutoResume(accountId: string): void {
  pendingAutoResume.add(accountId);
}

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

  ipcMain.once('renderer-ready', () => {
    for (const id of pendingAutoResume) {
      void runBackup(id);
    }
    pendingAutoResume.clear();
  });

  /**
   * Run a backup for one account, returning a shared promise so that manual
   * and scheduled callers for the same id await the same in-flight run.
   * Does NOT advance the shared schedule's next_run — the scheduler does that
   * once per full sequential pass.
   */
  function runBackup(id: string): Promise<void> {
    const existing = inFlightRuns.get(id);
    if (existing) return existing;
    const promise = doRunBackup(id).finally(() => {
      inFlightRuns.delete(id);
    });
    inFlightRuns.set(id, promise);
    return promise;
  }

  async function doRunBackup(id: string): Promise<void> {
    const account = getAccount(id);
    if (!account) throw new Error(`Account ${id} not found`);
    if (!account.backup_folder) throw new Error('No backup folder configured');

    const pio = new ElectronPlatformIO((entry) => {
      emit({ type: 'log:entry', account_id: entry.account_id, entry });
    });

    // Unified log lives at the shared backup folder root, not per-journal.
    const logMgr = new LogManager(pio, account.backup_folder);

    let engineStarted = false;
    try {
      const rawToken = decryptToken(account.access_token);
      const client = new BlipfotoClient(rawToken);

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
        logMgr,
      );

      try {
        await writeBViewFiles(account.username, account.backup_folder);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        pio.log({
          id: uuidv4(),
          account_id: id,
          timestamp: new Date().toISOString(),
          level: 'warn',
          message,
        });
      }

      activeEngines.set(id, engine);
      engineStarted = true;
      await engine.run();

      const updated = getAccount(id);
      if (updated) {
        const journalFolder = path.join(updated.backup_folder, updated.username);
        const journal = await new JournalIndex(pio, journalFolder).load();
        await saveAccount({
          ...updated,
          last_backup_at: new Date().toISOString(),
          total_archived: journal?.entries.length ?? updated.total_archived,
          journal_entry_total: journal?.entry_total ?? updated.journal_entry_total,
          rag_state: 'green',
          error_message: null,
        });
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
        await saveAccount({
          ...updated,
          rag_state: isAuthExpired ? 'red' : 'amber',
          error_message: errorMessage,
        });
        if (isAuthExpired) {
          const win = getMainWindow();
          win?.show();
          win?.focus();
        }
        // Engine emits backup:failed itself before rethrowing; only emit here
        // for failures that occurred before engine.run() was reached.
        if (!engineStarted) {
          emit({
            type: 'backup:event',
            event: {
              type: 'failed',
              account_id: id,
              error: { kind: 'api_error', code: 0, message: errorMessage },
            },
          });
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
      await saveAccount({
        ...existing,
        access_token: encryptToken(rawToken),
        journal_entry_total: profile.details?.entry_total ?? existing.journal_entry_total,
        avatar_url: profile.user.avatar_url,
        journal_title: profile.details?.journal_title ?? existing.journal_title,
        rag_state: 'amber',
        error_message: null,
      });
      scheduler.rearm();
      emitStoreChanged();
      return;
    }

    // Inherit shared schedule/delay/gap/redo from any existing account
    // (or defaults if this is the first account). backup_folder is also
    // shared and read from the user-data store.
    const template = getAccounts()[0];
    const account: AccountConfig = {
      id: uuidv4(),
      username: profile.user.username,
      journal_title: profile.details?.journal_title ?? profile.user.username,
      avatar_url: profile.user.avatar_url,
      access_token: encryptToken(rawToken),
      backup_folder: template?.backup_folder ?? '',
      schedule: template?.schedule ?? {
        enabled: true,
        next_run: computeNextRun(2, 'daily'),
        hour: 2,
        interval: 'daily',
      },
      gap_check_days: template?.gap_check_days ?? 31,
      redo_count: template?.redo_count ?? 7,
      api_delay_ms: template?.api_delay_ms ?? 250,
      last_backup_at: null,
      total_archived: 0,
      journal_entry_total: profile.details?.entry_total ?? 0,
      rag_state: 'amber',
      error_message: null,
    };

    await saveAccount(account);
    scheduler.rearm();
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

  ipcMain.handle('removeAccount', async (_event, id: string) => {
    activeEngines.get(id)?.cancel();
    activeEngines.delete(id);
    stopServer(id);
    await deleteAccount(id);
    scheduler.rearm();
    emitStoreChanged();
  });

  async function performReauthorise(id: string, rawToken: string): Promise<void> {
    const account = getAccount(id);
    if (!account) throw new Error(`Account ${id} not found`);
    const client = new BlipfotoClient(rawToken);
    const profile = await client.getUserProfile({ returnDetails: true });
    await saveAccount({
      ...account,
      access_token: encryptToken(rawToken),
      journal_entry_total: profile.details?.entry_total ?? account.journal_entry_total,
      rag_state: 'amber',
      error_message: null,
    });
    scheduler.rearm();
    emitStoreChanged();
  }

  ipcMain.handle('reauthoriseAccount', async (_event, id: string) => {
    const rawToken = await startOAuthFlow();
    await performReauthorise(id, rawToken);
  });

  ipcMain.handle('reauthoriseAccountFresh', async (_event, id: string) => {
    const rawToken = await startOAuthFlowEmbedded(getMainWindow());
    await performReauthorise(id, rawToken);
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
    'chooseBackupFolder',
    async (): Promise<{ folder: string; existingSettings: boolean } | null> => {
      const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
      if (result.canceled || !result.filePaths[0]) return null;
      const folder = result.filePaths[0];
      const { existing } = await bindBackupFolder(folder);
      scheduler.rearm();
      emitStoreChanged();
      return { folder, existingSettings: existing };
    },
  );

  ipcMain.handle('moveBackupFolder', async (_event, newPath: string) => {
    // Save current portable cache to the new folder, then point user data at
    // it. Does NOT migrate backup files on disk — the user is responsible.
    await bindBackupFolder(newPath);
    scheduler.rearm();
    emitStoreChanged();
  });

  ipcMain.handle('getBootState', (): BootState => {
    const folder = getBackupFolder();
    if (!folder) return { stage: 'pick-folder' };
    const portable = getPortableSettings();
    if (portable.accounts.length === 0) return { stage: 'first-account' };
    return { stage: 'ready', store: getAppStore() };
  });

  ipcMain.handle(
    'updateSettings',
    async (_event, partial: SharedSettingsPartial): Promise<void> => {
      const current = getPortableSettings();
      const next = {
        ...current,
        schedule: partial.schedule ?? current.schedule,
        api_delay_ms: partial.api_delay_ms ?? current.api_delay_ms,
        gap_check_days: partial.gap_check_days ?? current.gap_check_days,
        redo_count: partial.redo_count ?? current.redo_count,
        ui: {
          thumbnail_size_percent: partial.thumbnailSizePercent ?? current.ui.thumbnail_size_percent,
        },
      };
      await savePortableSettings(next);

      if (partial.startWithWindows !== undefined) {
        userDataStore.set('app', {
          ...userDataStore.get('app'),
          startWithWindows: partial.startWithWindows,
        });
        app.setLoginItemSettings({ openAtLogin: partial.startWithWindows });
        rebuildTrayMenu();
      }

      scheduler.rearm();
      emitStoreChanged();
    },
  );

  ipcMain.handle(
    'updateAccountSettings',
    async (_event, id: string, settings: Partial<AccountConfig>) => {
      const account = getAccount(id);
      if (!account) throw new Error(`Account ${id} not found`);

      // backup_folder is shared and lives in user data; route changes through
      // bindBackupFolder so the portable settings file follows the folder.
      if (
        settings.backup_folder !== undefined &&
        settings.backup_folder !== account.backup_folder
      ) {
        await bindBackupFolder(settings.backup_folder);
      }

      const merged: AccountConfig = { ...account, ...settings };
      await saveAccount(merged);
      scheduler.rearm();
      emitStoreChanged();
    },
  );

  ipcMain.handle('getStore', () => getAppStore());

  ipcMain.handle('getLogs', async (): Promise<LogEntry[]> => {
    // Unified log: one file at the backup folder root containing entries
    // from every journal. Filtering happens in the renderer.
    const folder = getBackupFolder();
    if (!folder) return [];
    const pio = new ElectronPlatformIO(() => {
      /* silent — read-only access */
    });
    const logMgr = new LogManager(pio, folder);
    return logMgr.readAll();
  });

  ipcMain.handle(
    'exportLogsCsv',
    async (
      _event,
      filters: {
        account_id: string | null;
        backup_id: string | null;
        level: 'all' | 'error' | 'warn' | 'info';
      },
    ): Promise<string | null> => {
      const folder = getBackupFolder();
      if (!folder) return null;
      const pio = new ElectronPlatformIO(() => {
        /* silent */
      });
      const entries = await new LogManager(pio, folder).readAll();
      const accounts = getAccounts();
      const usernameById = new Map(accounts.map((a) => [a.id, a.username]));
      const filtered = entries.filter((e) => {
        if (filters.account_id !== null && e.account_id !== filters.account_id) return false;
        if (filters.backup_id !== null && e.backup_id !== filters.backup_id) return false;
        if (filters.level !== 'all' && e.level !== filters.level) return false;
        return true;
      });
      const csv = toCsv(filtered, usernameById);
      const today = new Date().toISOString().slice(0, 10);
      const result = await dialog.showSaveDialog({
        defaultPath: `b-ark-log-${today}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
      });
      if (result.canceled || !result.filePath) return null;
      await fs.promises.writeFile(result.filePath, csv, 'utf-8');
      return result.filePath;
    },
  );

  // Re-export for use from main.ts (scheduler callback wiring)
  schedulerRunner = runBackup;
  // touch getAccounts to avoid unused import in some build modes
  void getAccounts;
}

// Set by registerIpcHandlers, used by main.ts to wire the scheduler callbacks.
let schedulerRunner: ((id: string) => Promise<void>) | null = null;

export function triggerScheduledBackup(id: string): Promise<void> {
  if (schedulerRunner) {
    return schedulerRunner(id);
  }
  return Promise.resolve();
}

/**
 * Advance the shared schedule's next_run after a sequential pass. Called by
 * the scheduler once per full pass — manual single-account runs do not
 * advance it.
 */
export async function advanceSharedNextRun(): Promise<void> {
  const settings = getPortableSettings();
  await savePortableSettings({
    ...settings,
    schedule: {
      ...settings.schedule,
      next_run: computeNextRun(settings.schedule.hour, settings.schedule.interval),
    },
  });
}

export async function hasIncompleteFirstBackup(account: AccountConfig): Promise<boolean> {
  if (!account.backup_folder || account.total_archived > 0) return false;
  // Either a checkpoint file or an incremental journal.json written mid-backup
  // indicates a first backup that started but never completed.
  for (const filename of ['_checkpoint.json', 'journal.json']) {
    try {
      await fs.promises.access(path.join(account.backup_folder, account.username, filename));
      return true;
    } catch {
      // not found — try next
    }
  }
  return false;
}
