// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { BlipfotoClient } from '@b-oss/b-api';
import { BackupEngine, LogManager } from '@b-oss/backup-engine';
import type { AccountBackupConfig, BackupEvent } from '@b-oss/backup-engine';
import type {
  AccountConfig,
  AppStore,
  BackendContext,
  BootState,
  LogCsvFilters,
  LogEntry,
  MainEvent,
  SharedSettingsPartial,
} from '@b-oss/b-ark-ui-components';
import { BrowserPlatformIO } from './browser-platform-io.js';
import { loadToken, clearToken } from './token-storage.js';
import { loadHandle, saveHandle, clearHandle, queryFsaPermission } from './fsa-persistence.js';

// ── Persisted shapes (chrome.storage.local) ────────────────────────────────

interface ChromeSettings {
  journal_title: string;
  avatar_url: string;
  account_added_at: string | null;
  period: 'daily' | 'weekly';
  api_delay_ms: number;
  thumbnailSizePercent: number;
  showInfoOverlay: boolean;
}

interface ChromeStatus {
  last_backup_at: string | null;
  total_archived: number;
  journal_entry_total: number;
  rag_state: 'green' | 'amber' | 'red';
  error_message: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function describeBackupError(err: BackupEvent & { type: 'failed' }): string {
  switch (err.error.kind) {
    case 'auth_expired':
      return 'Authentication expired — reauthorise via Settings.';
    case 'network':
      return 'Network error.';
    case 'api_error':
      return `API error ${err.error.code}: ${err.error.message}`;
    case 'filesystem':
      return `Filesystem error: ${err.error.message}`;
  }
}

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ── BrowserBackend ──────────────────────────────────────────────────────────

export class BrowserBackend implements BackendContext {
  readonly appVersion: string = __APP_VERSION__;

  private readonly _listeners: Array<(event: MainEvent) => void> = [];
  private _engine: BackupEngine | null = null;
  private _handle: FileSystemDirectoryHandle | null = null;

  // ── Events ─────────────────────────────────────────────────────────────

  subscribe(handler: (event: MainEvent) => void): () => void {
    this._listeners.push(handler);
    return () => {
      const idx = this._listeners.indexOf(handler);
      if (idx !== -1) this._listeners.splice(idx, 1);
    };
  }

  private _emit(event: MainEvent): void {
    for (const l of this._listeners) l(event);
  }

  notifyRendererReady(): void {
    void (async () => {
      this._handle = await loadHandle();

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if ('oauthStatus' in changes || 'b_ark_status' in changes || 'b_ark_settings' in changes) {
          if (changes['oauthStatus']?.newValue === 'success') {
            void this._onOAuthSuccess();
          } else {
            void this._reloadAndEmitStore();
          }
        }
      });

      const store = await this.getStore();
      this._emit({ type: 'store:changed', store });
    })();
  }

  private async _onOAuthSuccess(): Promise<void> {
    this._handle = await loadHandle();
    const stored = await chrome.storage.local.get('b_ark_settings');
    const settings = (stored['b_ark_settings'] ?? {}) as Partial<ChromeSettings>;
    if (!settings.account_added_at) {
      settings.account_added_at = new Date().toISOString();
      await chrome.storage.local.set({ b_ark_settings: settings });
    }
    await this._reloadAndEmitStore();
  }

  private async _reloadAndEmitStore(): Promise<void> {
    this._handle = await loadHandle();
    const store = await this.getStore();
    this._emit({ type: 'store:changed', store });
  }

  // ── Storage helpers ─────────────────────────────────────────────────────

  private async _readSettings(): Promise<Partial<ChromeSettings>> {
    const r = await chrome.storage.local.get('b_ark_settings');
    return (r['b_ark_settings'] ?? {}) as Partial<ChromeSettings>;
  }

  private async _readStatus(): Promise<Partial<ChromeStatus>> {
    const r = await chrome.storage.local.get('b_ark_status');
    return (r['b_ark_status'] ?? {}) as Partial<ChromeStatus>;
  }

  private async _patchSettings(partial: Partial<ChromeSettings>): Promise<void> {
    const current = await this._readSettings();
    await chrome.storage.local.set({ b_ark_settings: { ...current, ...partial } });
  }

  private async _patchStatus(partial: Partial<ChromeStatus>): Promise<void> {
    const current = await this._readStatus();
    await chrome.storage.local.set({ b_ark_status: { ...current, ...partial } });
  }

  // ── BackendContext: state ───────────────────────────────────────────────

  async getBootState(): Promise<BootState> {
    const token = await loadToken();
    if (!token) return { stage: 'first-account' };
    const handle = this._handle ?? (await loadHandle());
    if (!handle) return { stage: 'pick-folder' };
    const store = await this.getStore();
    return { stage: 'ready', store };
  }

  async getStore(): Promise<AppStore> {
    const token = await loadToken();
    const handle = this._handle ?? (await loadHandle());
    const settings = await this._readSettings();
    const status = await this._readStatus();

    const accounts: AccountConfig[] = token
      ? [
          {
            id: token.username,
            username: token.username,
            journal_title: settings.journal_title ?? token.username,
            avatar_url: settings.avatar_url ?? '',
            access_token: token.accessToken,
            backup_folder: handle?.name ?? '',
            schedule: {
              enabled: true,
              next_run: new Date().toISOString(),
              hour: 2,
              interval: settings.period ?? 'weekly',
            },
            gap_check_days: 30,
            redo_count: 7,
            api_delay_ms: settings.api_delay_ms ?? 500,
            last_backup_at: status.last_backup_at ?? null,
            total_archived: status.total_archived ?? 0,
            journal_entry_total: status.journal_entry_total ?? 0,
            rag_state: status.rag_state ?? 'green',
            error_message: status.error_message ?? null,
            account_added_at: settings.account_added_at ?? null,
          },
        ]
      : [];

    return {
      accounts,
      ui: {
        thumbnailSizePercent: settings.thumbnailSizePercent ?? 100,
        accountOrder: token ? [token.username] : [],
        showInfoOverlay: settings.showInfoOverlay ?? true,
      },
      app: { startWithWindows: false, autoUpdateEnabled: false },
    };
  }

  getAccountAvatar(_accountId: string): Promise<string | null> {
    return Promise.resolve(null);
  }

  async getLogs(): Promise<LogEntry[]> {
    const handle = this._handle ?? (await loadHandle());
    if (!handle) return [];
    const io = new BrowserPlatformIO(handle);
    const logMgr = new LogManager(io, '');
    return logMgr.readAll();
  }

  async exportLogsCsv(filters: LogCsvFilters): Promise<string | null> {
    const logs = await this.getLogs();
    const filtered = logs.filter((e) => {
      if (filters.account_id && e.account_id !== filters.account_id) return false;
      if (filters.backup_id && e.backup_id !== filters.backup_id) return false;
      if (filters.level !== 'all' && e.level !== filters.level) return false;
      return true;
    });
    if (filtered.length === 0) return null;
    const header = 'id,backup_id,account_id,timestamp,level,message';
    const rows = filtered.map((e) =>
      [
        csvEscape(e.id),
        csvEscape(e.backup_id ?? ''),
        csvEscape(e.account_id),
        csvEscape(e.timestamp),
        csvEscape(e.level),
        csvEscape(e.message),
      ].join(','),
    );
    return [header, ...rows].join('\n');
  }

  // ── BackendContext: backup ─────────────────────────────────────────────

  async startBackup(_accountId: string): Promise<void> {
    if (this._engine) return;

    const token = await loadToken();
    if (!token) throw new Error('Not signed in');

    const handle = this._handle ?? (await loadHandle());
    if (!handle) throw new Error('No backup folder');

    const perm = await queryFsaPermission(handle);
    if (perm !== 'granted') {
      await this._patchStatus({ rag_state: 'red', error_message: 'Folder access denied' });
      await chrome.storage.local.set({ chip_rag: 'red', chip_error_kind: 'permission' });
      this._emit({
        type: 'backup:event',
        event: {
          type: 'failed',
          account_id: token.username,
          error: { kind: 'filesystem', message: 'Folder access denied — click to re-grant' },
        },
      });
      const store = await this.getStore();
      this._emit({ type: 'store:changed', store });
      return;
    }

    const io = new BrowserPlatformIO(handle);
    const logMgr = new LogManager(io, '');

    await chrome.storage.local.set({
      chip_rag: 'amber',
      chip_progress: null,
      chip_error_kind: null,
    });

    const client = new BlipfotoClient(token.accessToken);
    let journalTitle = token.username;
    let avatarUrl = '';
    try {
      const profile = await client.getUserProfile({
        username: token.username,
        returnDetails: true,
      });
      journalTitle = profile.details?.journal_title ?? token.username;
      avatarUrl = profile.user.avatar_url;
      await this._patchSettings({ journal_title: journalTitle, avatar_url: avatarUrl });
    } catch {
      // continue with defaults
    }

    const config: AccountBackupConfig = {
      id: token.username,
      username: token.username,
      journal_title: journalTitle,
      avatar_url: avatarUrl,
      access_token: token.accessToken,
      backup_folder: '',
      redo_count: 7,
      gap_check_days: 30,
      api_delay_ms: 500,
      app_version: __APP_VERSION__,
    };

    const onEvent = (event: BackupEvent): void => {
      this._emit({ type: 'backup:event', event });

      if (event.type === 'progress') {
        void chrome.storage.local.set({
          chip_progress: { done: event.done, total: event.total },
        });
      }

      if (event.type === 'completed') {
        const now = new Date().toISOString();
        void this._patchStatus({
          last_backup_at: now,
          total_archived: event.total_archived,
          rag_state: 'green',
          error_message: null,
        });
        void chrome.storage.local.set({
          chip_rag: 'green',
          chip_progress: null,
          chip_last_backup_at: now,
          chip_error_kind: null,
        });
        void logMgr.readAll().then((entries) => {
          for (const entry of entries) {
            this._emit({ type: 'log:entry', account_id: token.username, entry });
          }
          return this._reloadAndEmitStore();
        });
      }

      if (event.type === 'failed') {
        const errorKind = event.error.kind === 'auth_expired' ? 'auth' : 'permission';
        void this._patchStatus({ rag_state: 'red', error_message: describeBackupError(event) });
        void chrome.storage.local.set({
          chip_rag: 'red',
          chip_error_kind: errorKind,
          chip_progress: null,
        });
        void this._reloadAndEmitStore();
      }
    };

    const engine = new BackupEngine(config, io, client, onEvent, logMgr);
    this._engine = engine;
    try {
      await engine.run();
    } catch {
      // engine.cancel() throws — expected
    } finally {
      this._engine = null;
    }
  }

  cancelBackup(_accountId: string): Promise<void> {
    this._engine?.cancel();
    return Promise.resolve();
  }

  // ── BackendContext: account management ─────────────────────────────────

  async addAccount(): Promise<void> {
    await chrome.runtime.sendMessage({ type: 'start_oauth' });
  }

  async addAccountFresh(): Promise<void> {
    await chrome.runtime.sendMessage({ type: 'start_oauth' });
  }

  async reauthoriseAccount(_accountId: string): Promise<void> {
    await chrome.runtime.sendMessage({ type: 'start_oauth' });
  }

  async reauthoriseAccountFresh(_accountId: string): Promise<void> {
    await chrome.runtime.sendMessage({ type: 'start_oauth' });
  }

  async removeAccount(_accountId: string): Promise<void> {
    await clearToken();
    await clearHandle();
    this._handle = null;
    await chrome.storage.local.remove([
      'b_ark_settings',
      'b_ark_status',
      'chip_rag',
      'chip_last_backup_at',
      'chip_error_kind',
      'chip_progress',
    ]);
    const store = await this.getStore();
    this._emit({ type: 'store:changed', store });
  }

  // ── BackendContext: folder ─────────────────────────────────────────────

  async pickFolder(): Promise<string | null> {
    try {
      const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
      await saveHandle(dir);
      this._handle = dir;
      const store = await this.getStore();
      this._emit({ type: 'store:changed', store });
      return dir.name;
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return null;
      throw e;
    }
  }

  async chooseBackupFolder(): Promise<{ folder: string; existingSettings: boolean } | null> {
    const folder = await this.pickFolder();
    if (!folder) return null;
    return { folder, existingSettings: false };
  }

  async moveBackupFolder(_newPath: string): Promise<void> {
    await this.pickFolder();
  }

  // ── BackendContext: settings ───────────────────────────────────────────

  async updateSettings(partial: SharedSettingsPartial): Promise<void> {
    const patch: Partial<ChromeSettings> = {};
    if (partial.thumbnailSizePercent !== undefined) {
      patch.thumbnailSizePercent = partial.thumbnailSizePercent;
    }
    if (partial.showInfoOverlay !== undefined) {
      patch.showInfoOverlay = partial.showInfoOverlay;
    }
    if (partial.api_delay_ms !== undefined) {
      patch.api_delay_ms = partial.api_delay_ms;
    }
    if (partial.schedule?.interval !== undefined) {
      patch.period = partial.schedule.interval === 'monthly' ? 'weekly' : partial.schedule.interval;
    }
    if (Object.keys(patch).length > 0) {
      await this._patchSettings(patch);
      const store = await this.getStore();
      this._emit({ type: 'store:changed', store });
    }
  }

  async updateAccountSettings(
    _accountId: string,
    _settings: Partial<AccountConfig>,
  ): Promise<void> {
    // Deprecated — no-op for Chrome
  }

  // ── BackendContext: viewer ─────────────────────────────────────────────

  async openViewer(_accountId: string): Promise<void> {
    await chrome.runtime.sendMessage({ type: 'open_backup_page' });
  }

  getViewerUrl(_accountId: string): Promise<string> {
    return Promise.resolve('');
  }
}
