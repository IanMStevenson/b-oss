// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Pure assembly of the values BrowserBackend exposes — kept side-effect-free (no chrome.*,
// no fetch, no state) so the imperative backend can stay thin and these can be unit-tested.

import type { AccountBackupConfig, BackupEvent } from '@b-oss/backup-engine';
import type { AccountConfig, AppStore } from '@b-oss/b-ark-ui-components';
import type { ChromeStatus } from './status-storage.js';
import type { StoredToken } from './token-storage.js';

/** Account settings as persisted under `b_ark_settings` in chrome.storage.local. */
export interface ChromeSettings {
  journal_title: string;
  avatar_url: string;
  account_added_at: string | null;
  period: 'daily' | 'weekly';
  schedule_enabled: boolean;
  api_delay_ms: number;
  gap_check_days: number;
  redo_count: number;
  thumbnailSizePercent: number;
  showInfoOverlay: boolean;
  enable_web_scrape: boolean;
  download_hires: boolean;
}

const PERIOD_MS: Record<'daily' | 'weekly', number> = {
  daily: 86_400_000,
  weekly: 7 * 86_400_000,
};

/** Human-readable message for a failed backup event. */
export function describeBackupError(err: BackupEvent & { type: 'failed' }): string {
  switch (err.error.kind) {
    case 'auth_expired':
      return 'Authentication expired — reauthorise via Settings.';
    case 'network':
      return 'Network error.';
    case 'api_error':
      return `API error ${err.error.code}: ${err.error.message}`;
    case 'filesystem':
      return `Filesystem error: ${err.error.message}`;
    case 'unexpected':
      return `Unexpected error: ${err.error.message}`;
  }
}

/**
 * "Next backup" caption for the status bar, covering all four combinations of
 * visit-trigger and publish-trigger being enabled or disabled.
 */
export function nextBackupCaption(
  scheduleEnabled: boolean,
  backupOnPublish: boolean,
  lastBackupAt: string | null,
  period: 'daily' | 'weekly',
): string {
  const visitText = (): string => {
    if (!lastBackupAt) return 'On next visit';
    const due = new Date(lastBackupAt).getTime() + PERIOD_MS[period];
    if (due <= Date.now()) return 'On next visit';
    const d = new Date(due);
    const when =
      d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
      ' ' +
      d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `On visit after ${when}`;
  };

  if (!scheduleEnabled && !backupOnPublish) return 'Manual';
  if (backupOnPublish && !scheduleEnabled) return 'On publish';
  if (scheduleEnabled && !backupOnPublish) return visitText();
  // both enabled
  const visit = visitText();
  return visit === 'On next visit'
    ? 'On publish, or next visit'
    : `On publish, or visit after ${visit.replace('On visit after ', '')}`;
}

export interface BuildAppStoreParams {
  token: StoredToken | null;
  folderName: string;
  settings: Partial<ChromeSettings>;
  status: Partial<ChromeStatus>;
  archived: number;
  entryTotal: number;
  lastEntryDate: string | null;
  backupOnPublish: boolean;
}

/** Assemble the AppStore the page consumes from the already-read inputs. */
export function buildAppStore({
  token,
  folderName,
  settings,
  status,
  archived,
  entryTotal,
  lastEntryDate,
  backupOnPublish,
}: BuildAppStoreParams): AppStore {
  const period = settings.period ?? 'weekly';
  const scheduleEnabled = settings.schedule_enabled ?? true;

  const accounts: AccountConfig[] = token
    ? [
        {
          id: token.username,
          username: token.username,
          journal_title: settings.journal_title ?? token.username,
          avatar_url: settings.avatar_url ?? '',
          access_token: token.accessToken,
          backup_folder: folderName,
          schedule: {
            enabled: scheduleEnabled,
            next_run: new Date().toISOString(),
            hour: 2,
            interval: period,
          },
          schedule_caption: nextBackupCaption(
            scheduleEnabled,
            backupOnPublish,
            status.last_backup_at ?? null,
            period,
          ),
          gap_check_days: settings.gap_check_days ?? 30,
          redo_count: settings.redo_count ?? 7,
          api_delay_ms: settings.api_delay_ms ?? 0,
          last_backup_at: status.last_backup_at ?? null,
          last_entry_date: lastEntryDate,
          total_archived: archived,
          journal_entry_total: entryTotal,
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

export interface BuildBackupConfigParams {
  token: StoredToken;
  settings: Partial<ChromeSettings>;
  appVersion: string;
  /** Live journal title/avatar from the pre-run profile fetch (fall back to token/settings). */
  journalTitle: string;
  avatarUrl: string;
}

/** Build the engine config for a backup run from the token + persisted settings. */
export function buildBackupConfig({
  token,
  settings,
  appVersion,
  journalTitle,
  avatarUrl,
}: BuildBackupConfigParams): AccountBackupConfig {
  return {
    id: token.username,
    username: token.username,
    journal_title: journalTitle,
    avatar_url: avatarUrl,
    access_token: token.accessToken,
    backup_folder: '',
    redo_count: settings.redo_count ?? 7,
    gap_check_days: settings.gap_check_days ?? 30,
    api_delay_ms: settings.api_delay_ms ?? 0,
    metadata_write_interval: 5,
    app_version: appVersion,
    enable_web_scrape: settings.enable_web_scrape ?? false,
    download_hires: settings.download_hires ?? false,
  };
}
