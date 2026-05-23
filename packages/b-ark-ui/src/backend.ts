// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

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
  total_archived: number;
  journal_entry_total: number;
  rag_state: 'green' | 'amber' | 'red';
  error_message: string | null;
}

export interface AppStore {
  accounts: AccountConfig[];
  ui: {
    thumbnailSizePercent: number;
    accountOrder: string[];
  };
  app: {
    startWithWindows: boolean;
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
  | { kind: 'filesystem'; message: string };

export type BackupEvent =
  | { type: 'started'; account_id: string; total_to_fetch: number }
  | { type: 'progress'; account_id: string; done: number; total: number; current_date: string }
  | { type: 'rate_limited'; account_id: string; resume_in_seconds: number }
  | { type: 'completed'; account_id: string; total_archived: number }
  | { type: 'failed'; account_id: string; error: BackupErrorPayload };

export type MainEvent =
  | { type: 'store:changed'; store: AppStore }
  | { type: 'backup:event'; event: BackupEvent }
  | { type: 'log:entry'; account_id: string; entry: LogEntry };

export interface BackendContext {
  addAccount(): Promise<void>;
  addAccountFresh(): Promise<void>;
  removeAccount(accountId: string): Promise<void>;
  reauthoriseAccount(accountId: string): Promise<void>;

  startBackup(accountId: string): Promise<void>;
  cancelBackup(accountId: string): Promise<void>;

  openViewer(accountId: string): Promise<void>;
  getViewerUrl(accountId: string): Promise<string>;

  pickFolder(): Promise<string | null>;
  updateAccountSettings(accountId: string, settings: Partial<AccountConfig>): Promise<void>;

  getStore(): Promise<AppStore>;
  getLogs(accountId: string): Promise<LogEntry[]>;

  subscribe(handler: (event: MainEvent) => void): () => void;
}
