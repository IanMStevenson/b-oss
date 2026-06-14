// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { BlipfotoClient } from '@b-oss/b-api';
import { BackupEngine, LogManager } from '@b-oss/backup-engine';
import type { BackupEvent } from '@b-oss/backup-engine';
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
import { readJournal } from './journal-source.js';
import { deployViewer } from './deploy-viewer.js';
import { loadToken, clearToken } from './token-storage.js';
import { loadHandle, saveHandle, clearHandle, queryFsaPermission } from './fsa-persistence.js';
import {
  readStatus,
  patchStatus,
  setWorking,
  setCompleted,
  setCancelledIncomplete,
  setFailed,
  setRateLimited,
  clearError,
  setStarting,
  setProgress,
  setAvatar,
  clearAll as clearStatus,
} from './status-storage.js';
import {
  readLifecycle,
  clearLifecycle,
  readBackupLock,
  acquireBackupLock,
  releaseBackupLock,
} from './lifecycle-storage.js';
import {
  type ChromeSettings,
  buildAppStore,
  buildBackupConfig,
  describeBackupError,
} from './store-builder.js';
import { buildLogsCsv } from './log-export.js';

// ── BrowserBackend ──────────────────────────────────────────────────────────

export class BrowserBackend implements BackendContext {
  readonly appVersion: string = __APP_VERSION__;

  private readonly _listeners: Array<(event: MainEvent) => void> = [];
  private _engine: BackupEngine | null = null;
  private _handle: FileSystemDirectoryHandle | null = null;

  // Phase 5 lifecycle — set in _initLifecycle()
  private _autoLaunched = false;
  private _adopted = false;
  private _tabId: number | null = null;

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

  private async _initLifecycle(): Promise<void> {
    let tab: chrome.tabs.Tab | undefined;
    try {
      tab = await chrome.tabs.getCurrent();
    } catch {
      return; // not in a tab context (e.g. content script)
    }
    if (!tab?.id) return;
    this._tabId = tab.id;

    // Claim the singleton: the SW makes this the canonical backup tab, or — if another
    // live backup tab already owns it (session-restore / manual duplicate) — focuses that
    // one and closes this duplicate.
    void chrome.runtime.sendMessage({ type: 'claim_backup_tab', tab_id: tab.id }).catch(() => {});

    const lifecycle = await readLifecycle();
    if (lifecycle?.tab_id === tab.id && lifecycle.launched_by === 'visit-trigger') {
      this._autoLaunched = true;

      const markAdopted = (): void => {
        if (!this._adopted) {
          this._adopted = true;
          void chrome.runtime.sendMessage({ type: 'mark_tab_adopted' }).catch(() => {});
        }
      };
      window.addEventListener('focus', markAdopted);
      // Already focused (user had the tab open)
      if (document.hasFocus()) markAdopted();
    }
  }

  notifyRendererReady(): void {
    void (async () => {
      this._handle = await loadHandle();
      await this._initLifecycle();

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        const oauthStatus: unknown = changes['oauthStatus']?.newValue;
        if (oauthStatus === 'success') {
          void this._onOAuthSuccess();
          return;
        }
        if (oauthStatus === 'error') {
          const rawError: unknown = changes['oauthError']?.newValue;
          const message = typeof rawError === 'string' ? rawError : 'Sign-in failed.';
          this._emit({
            type: 'toast',
            toast: { id: crypto.randomUUID(), level: 'error', message },
          });
          return;
        }
        if (
          'b_ark_status' in changes ||
          'b_ark_settings' in changes ||
          'backup_on_publish' in changes
        ) {
          void this._reloadAndEmitStore();
        }
      });

      const store = await this.getStore();
      this._emit({ type: 'store:changed', store });

      // Refresh the on-disk viewer/README on startup so a returning user tracks the
      // installed extension version even without running a new backup.
      void this._maybeDeployViewer();

      // Auto-start backup when launched by the visit-trigger
      if (this._autoLaunched) {
        const boot = await this.getBootState();
        if (boot.stage === 'ready' && boot.store.accounts[0]) {
          void this.startBackup(boot.store.accounts[0].id);
        }
      }
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
    // A fresh token means any prior auth-error red is resolved — clear it so the
    // banner/chip don't stay red until the next completed backup.
    await clearError();
    await this._reloadAndEmitStore();
  }

  private async _reloadAndEmitStore(): Promise<void> {
    this._handle = await loadHandle();
    const store = await this.getStore();
    this._emit({ type: 'store:changed', store });
  }

  private _notifySwOnComplete(): void {
    // Ask SW to close the tab if it was auto-launched and the user never adopted it.
    // (SW re-checks backup_lifecycle.user_adopted before actually removing the tab.)
    void chrome.runtime.sendMessage({ type: 'close_backup_tab' }).catch(() => {});
  }

  private _notifySwOnFailure(): void {
    // Ask SW to raise the backup tab so the user sees the error (never silent).
    void chrome.runtime.sendMessage({ type: 'raise_backup_tab' }).catch(() => {});
  }

  // ── Storage helpers ─────────────────────────────────────────────────────

  private async _readSettings(): Promise<Partial<ChromeSettings>> {
    const r = await chrome.storage.local.get('b_ark_settings');
    return (r['b_ark_settings'] ?? {}) as Partial<ChromeSettings>;
  }

  private async _patchSettings(partial: Partial<ChromeSettings>): Promise<void> {
    const current = await this._readSettings();
    await chrome.storage.local.set({ b_ark_settings: { ...current, ...partial } });
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
    const status = await readStatus();
    const bopResult = await chrome.storage.local.get('backup_on_publish');
    const backupOnPublish = bopResult['backup_on_publish'] === true;

    // Best-effort: read the on-disk journal index so the counts and "Last entry"
    // reflect real progress even when idle (e.g. an incomplete first run). Falls
    // back to the persisted status when the file or folder permission is absent.
    let archived = status.total_archived ?? 0;
    let entryTotal = status.journal_entry_total ?? 0;
    let lastEntryDate: string | null = null;
    if (token && handle) {
      try {
        const meta = await readJournal(handle, token.username);
        archived = meta.entries.length;
        if (!entryTotal) entryTotal = meta.entry_total;
        lastEntryDate = meta.entries[0]?.date ?? null;
      } catch {
        // No journal yet / no permission — keep the persisted fallbacks.
      }
    }

    return buildAppStore({
      token,
      folderName: handle?.name ?? '',
      settings,
      status,
      archived,
      entryTotal,
      lastEntryDate,
      backupOnPublish,
    });
  }

  private _avatarSourceUrl: string | null = null;
  private _avatarDataUrl: string | null = null;

  // Fetch the Blipfoto avatar via the extension context (host_permissions cover
  // *.blipfoto.com / *.cloudfront.net, so cross-origin fetch is allowed) and return it
  // as a data: URL. The page <img> can't always load the remote URL directly, so we
  // resolve the bytes ourselves and cache by source URL.
  async getAccountAvatar(_accountId: string): Promise<string | null> {
    try {
      let url = (await this._readSettings()).avatar_url ?? '';
      if (!url) {
        const token = await loadToken();
        if (!token) return null;
        const profile = await new BlipfotoClient(token.accessToken).getUserProfile({
          username: token.username,
          returnDetails: false,
        });
        url = profile.user.avatar_url ?? '';
        if (url) await this._patchSettings({ avatar_url: url });
      }
      if (!url) return null;
      if (this._avatarDataUrl && this._avatarSourceUrl === url) return this._avatarDataUrl;

      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      const dataUrl = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
      this._avatarSourceUrl = url;
      this._avatarDataUrl = dataUrl;
      return dataUrl;
    } catch {
      return null;
    }
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
    return buildLogsCsv(logs, filters);
  }

  // ── BackendContext: backup ─────────────────────────────────────────────

  async startBackup(_accountId: string): Promise<void> {
    if (this._engine) return; // same-tab guard

    // Cross-tab guard: never let two tabs run BackupEngine against the same FSA folder.
    // (Belt-and-braces alongside the single-tab enforcement; only bites in the brief window
    // where a duplicate tab exists before it self-evicts.)
    const lock = await readBackupLock();
    if (
      lock &&
      this._tabId !== null &&
      lock.tab_id !== this._tabId &&
      (await this._tabIsLive(lock.tab_id))
    ) {
      return; // another live tab owns the backup
    }

    const token = await loadToken();
    if (!token) throw new Error('Not signed in');

    const handle = this._handle ?? (await loadHandle());
    if (!handle) throw new Error('No backup folder');

    const perm = await queryFsaPermission(handle);
    if (perm !== 'granted') {
      await setFailed('filesystem', 'Folder access denied');
      this._notifySwOnFailure();
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
    const settings = await this._readSettings();

    await setStarting();

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
      // Write avatar as data-URL so the chip content-script can display it without cross-origin fetching
      void this.getAccountAvatar(token.username).then((dataUrl) => {
        if (dataUrl) void setAvatar(dataUrl);
      });
      // Persist the journal's true entry total so the status bar's "X of Y"
      // shows a real denominator even before the first run completes.
      if (typeof profile.details?.entry_total === 'number') {
        await patchStatus({ journal_entry_total: profile.details.entry_total });
      }
    } catch {
      // continue with defaults
    }

    const config = buildBackupConfig({
      token,
      settings,
      appVersion: this.appVersion,
      journalTitle,
      avatarUrl,
    });

    const onEvent = (event: BackupEvent): void => {
      this._emit({ type: 'backup:event', event });

      if (event.type === 'started') {
        // First successful network transaction of a (re)started run — it's working
        // again, so clear any stale red back to amber.
        void setWorking().then(() => this._reloadAndEmitStore());
      }

      if (event.type === 'rate_limited') {
        void setRateLimited();
      }

      if (event.type === 'progress') {
        void setProgress({ done: event.done, total: event.total });
      }

      if (event.type === 'completed') {
        const now = new Date().toISOString();
        void setCompleted(now, event.total_archived);
        void deployViewer(io, token.username);
        this._notifySwOnComplete();
        void logMgr.readAll().then((entries) => {
          for (const entry of entries) {
            this._emit({ type: 'log:entry', account_id: token.username, entry });
          }
          return this._reloadAndEmitStore();
        });
      }

      if (event.type === 'cancelled') {
        // Cancellation leaves the backup incomplete — amber, not red, not green.
        void setCancelledIncomplete().then(() => this._reloadAndEmitStore());
      }

      if (event.type === 'failed') {
        this._notifySwOnFailure();
        void setFailed(event.error.kind, describeBackupError(event)).then(() =>
          this._reloadAndEmitStore(),
        );
      }
    };

    const engine = new BackupEngine(config, io, client, onEvent, logMgr);
    this._engine = engine;
    if (this._tabId !== null) await acquireBackupLock(this._tabId, new Date().toISOString());
    try {
      await engine.run();
    } catch {
      // engine.cancel() throws — expected
    } finally {
      this._engine = null;
      if (this._tabId !== null) await releaseBackupLock(this._tabId);
    }
  }

  private async _tabIsLive(tabId: number): Promise<boolean> {
    try {
      await chrome.tabs.get(tabId);
      return true;
    } catch {
      return false;
    }
  }

  cancelBackup(_accountId: string): Promise<void> {
    this._engine?.cancel();
    return Promise.resolve();
  }

  /**
   * Deploy the bundled b-view viewer + README into the journal folder, but only when a
   * signed-in account and a permission-granted folder handle are both present. Used by the
   * folder-pick and startup triggers; the completed-backup trigger calls deployViewer()
   * directly with its in-scope io/username. Best-effort — never throws.
   */
  private async _maybeDeployViewer(): Promise<void> {
    const token = await loadToken();
    if (!token) return;
    const handle = this._handle ?? (await loadHandle());
    if (!handle) return;
    if ((await queryFsaPermission(handle)) !== 'granted') return;
    await deployViewer(new BrowserPlatformIO(handle), token.username);
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
    // Clear status/chip state and the backup lifecycle through their owning modules;
    // the settings/folder keys here are owned directly by this backend.
    await clearStatus();
    await clearLifecycle();
    // Also clear the transient OAuth status so no stale 'success'/'error' lingers
    // for the next sign-in (the chip + page react to changes in these keys).
    await chrome.storage.local.remove([
      'b_ark_settings',
      'folder_ready',
      'oauthStatus',
      'oauthError',
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
      // Let the SW know a folder is ready so visit-triggers can fire.
      await chrome.storage.local.set({ folder_ready: true });
      const store = await this.getStore();
      this._emit({ type: 'store:changed', store });
      // Drop the viewer/README into the freshly chosen folder.
      void this._maybeDeployViewer();
      return dir.name;
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return null;
      throw e;
    }
  }

  async chooseBackupFolder(): Promise<{ folder: string; existingSettings: boolean } | null> {
    const folder = await this.pickFolder();
    if (!folder) return null;
    let existingSettings = false;
    if (this._handle) {
      try {
        await this._handle.getFileHandle('b-ark-settings.json', { create: false });
        existingSettings = true;
      } catch {
        // File not found — no conflict
      }
    }
    return { folder, existingSettings };
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
    if (partial.gap_check_days !== undefined) {
      patch.gap_check_days = partial.gap_check_days;
    }
    if (partial.redo_count !== undefined) {
      patch.redo_count = partial.redo_count;
    }
    if (partial.schedule?.interval !== undefined) {
      patch.period = partial.schedule.interval === 'monthly' ? 'weekly' : partial.schedule.interval;
    }
    if (partial.schedule?.enabled !== undefined) {
      patch.schedule_enabled = partial.schedule.enabled;
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
