// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { Toast } from './view-types.js';

export type ScheduleInterval = 'daily' | 'weekly' | 'monthly';

export interface PortableAccount {
  id: string;
  username: string;
  journal_title: string;
  avatar_url: string;
}

export interface PortableSchedule {
  enabled: boolean;
  next_run: string;
  hour: number;
  interval: ScheduleInterval;
}

export interface BArkSettings {
  schema_version: 1;
  accounts: PortableAccount[];
  account_order: string[];
  schedule: PortableSchedule;
  api_delay_ms: number;
  gap_check_days: number;
  redo_count: number;
  /**
   * Fetch original-size / hires / extra images by scraping the logged-in
   * blipfoto.com website (the JSON API withholds these from distributed apps).
   * Requires a per-account website sign-in (see `web_sessions` in UserDataStore).
   * Shared across all journals, like the other fields here. Added after schema
   * v1 shipped, so it is normalised to `false` when absent from an older file.
   */
  enable_web_scrape: boolean;
  /**
   * Also fetch hires images even when the original was already obtained
   * (redundant extra copy). A hires image is always fetched as a fallback when
   * the original isn't available, regardless of this setting — see b-oss#112.
   * Meaningless while `enable_web_scrape` is off. Same normalisation note as
   * `enable_web_scrape`.
   */
  download_hires: boolean;
  ui: { thumbnail_size_percent: number; show_info_overlay: boolean };
}

export interface AccountStatus {
  last_backup_at: string | null;
  last_entry_date: string | null;
  total_archived: number;
  journal_entry_total: number;
  rag_state: 'green' | 'amber' | 'red';
  error_message: string | null;
  account_added_at: string | null;
}

export interface UserDataStore {
  schema_version: 2;
  backup_folder: string;
  app: { startWithWindows: boolean; autoUpdateEnabled: boolean };
  tokens: Record<string, string>;
  status: Record<string, AccountStatus>;
  /**
   * Per-account blipfoto.com website session, keyed by account id. Value is a
   * base64 `safeStorage` ciphertext of the account's serialised session cookies
   * — same at-rest posture as `tokens`. Machine-local (a login on one machine
   * does not follow the portable settings folder). Absent on stores written
   * before this field existed; readers default to `{}`.
   */
  web_sessions: Record<string, string>;
}

export interface AccountConfig {
  id: string;
  username: string;
  journal_title: string;
  avatar_url: string;
  access_token: string;
  backup_folder: string;
  schedule: {
    enabled: boolean;
    next_run: string;
    hour: number;
    interval: 'daily' | 'weekly' | 'monthly';
  };
  gap_check_days: number;
  redo_count: number;
  api_delay_ms: number;
  last_backup_at: string | null;
  /** Date (YYYY-MM-DD) of the newest archived journal entry, if known. */
  last_entry_date?: string | null;
  total_archived: number;
  journal_entry_total: number;
  rag_state: 'green' | 'amber' | 'red';
  error_message: string | null;
  account_added_at: string | null;
  /**
   * Optional override for the "next backup" caption. When set (e.g. the Chrome
   * extension's visit-triggered model), it replaces the clock-based "next …"
   * text. Electron leaves it undefined to keep its real scheduled time.
   */
  schedule_caption?: string;
  /**
   * Mirror of the shared `enable_web_scrape` setting, surfaced per-account so
   * the renderer can show the website sign-in UI without a separate fetch.
   */
  enable_web_scrape?: boolean;
  /** Mirror of the shared `download_hires` setting. */
  download_hires?: boolean;
  /**
   * Whether this account currently has a usable (non-expired) blipfoto.com
   * website session stored. Derived, not persisted — recomputed whenever the
   * store is composed. Electron only.
   */
  web_session_signed_in?: boolean;
}

export interface AppStore {
  accounts: AccountConfig[];
  ui: {
    thumbnailSizePercent: number;
    accountOrder: string[];
    showInfoOverlay: boolean;
  };
  app: {
    startWithWindows: boolean;
    autoUpdateEnabled: boolean;
  };
}

export interface LogEntry {
  id: string;
  backup_id?: string;
  account_id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export type BackupErrorPayload =
  | { kind: 'auth_expired' }
  | { kind: 'network' }
  | { kind: 'api_error'; code: number; message: string }
  | { kind: 'filesystem'; message: string }
  | { kind: 'unexpected'; message: string };

export type BackupPhase = 'redo' | 'gap_fill' | 'new_posts' | 'image_repair';

export type BackupEvent =
  | {
      type: 'started';
      account_id: string;
      total_to_fetch: number;
      kind: 'first' | 'routine';
    }
  | {
      type: 'progress';
      account_id: string;
      done: number;
      total: number;
      current_date: string;
      total_archived: number;
      phase?: BackupPhase;
    }
  | { type: 'rate_limited'; account_id: string; resume_in_seconds: number }
  | { type: 'completed'; account_id: string; total_archived: number }
  | { type: 'cancelled'; account_id: string }
  | { type: 'failed'; account_id: string; error: BackupErrorPayload };

export type MainEvent =
  | { type: 'store:changed'; store: AppStore }
  | { type: 'backup:event'; event: BackupEvent }
  | { type: 'log:entry'; account_id: string; entry: LogEntry }
  | { type: 'toast'; toast: Toast };

export interface SharedSettingsPartial {
  schedule?: PortableSchedule;
  api_delay_ms?: number;
  gap_check_days?: number;
  redo_count?: number;
  thumbnailSizePercent?: number;
  showInfoOverlay?: boolean;
  startWithWindows?: boolean;
  autoUpdateEnabled?: boolean;
  enableWebScrape?: boolean;
  downloadHires?: boolean;
}

export type BootState =
  { stage: 'pick-folder' } | { stage: 'first-account' } | { stage: 'ready'; store: AppStore };

export interface BackendContext {
  /** Display version e.g. `0.1.0` (release) or `0.1.0.347.12` (dev build). */
  readonly appVersion: string;

  addAccount(): Promise<void>;
  addAccountFresh(): Promise<void>;
  removeAccount(accountId: string): Promise<void>;
  reauthoriseAccount(accountId: string): Promise<void>;
  reauthoriseAccountFresh(accountId: string): Promise<void>;

  startBackup(accountId: string): Promise<void>;
  cancelBackup(accountId: string): Promise<void>;

  openViewer(accountId: string): Promise<void>;
  getViewerUrl(accountId: string): Promise<string>;

  pickFolder(): Promise<string | null>;
  chooseBackupFolder(): Promise<{ folder: string; existingSettings: boolean } | null>;
  moveBackupFolder(newPath: string): Promise<void>;
  updateSettings(partial: SharedSettingsPartial): Promise<void>;
  /** @deprecated use updateSettings for shared fields; per-account writes go through addAccount/removeAccount/reauthorise. */
  updateAccountSettings(accountId: string, settings: Partial<AccountConfig>): Promise<void>;

  /**
   * Open a modal window for the user to sign in to the blipfoto.com website,
   * so backups can fetch original-size / hires / extra images. Resolves to the
   * resulting signed-in state; never rejects on user cancellation (closing the
   * window just resolves `false`). Electron only — undefined under Chrome,
   * which rides the browser's ambient session.
   */
  webLogin?(accountId: string): Promise<boolean>;
  /** Clear the stored blipfoto.com website session for an account. Electron only. */
  webLogout?(accountId: string): Promise<void>;

  getStore(): Promise<AppStore>;
  /**
   * Read the cached avatar JPEG from the account's journal folder and return
   * it as a `data:image/jpeg;base64,…` URL, or `null` if the file is missing.
   * Used by the UI to display the user's avatar without hitting the CDN.
   */
  getAccountAvatar(accountId: string): Promise<string | null>;
  getBootState(): Promise<BootState>;
  getLogs(): Promise<LogEntry[]>;
  exportLogsCsv(filters: LogCsvFilters): Promise<string | null>;

  subscribe(handler: (event: MainEvent) => void): () => void;
  notifyRendererReady(): void;
}

export interface LogCsvFilters {
  account_id: string | null;
  backup_id: string | null;
  level: 'all' | 'error' | 'warn' | 'info';
}
