// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type {
  AccountStatus,
  BArkSettings,
  PortableAccount,
  PortableSchedule,
} from '@b-oss/b-ark-ui-electron';
import { B_ARK_SETTINGS_SCHEMA_VERSION } from './schema-version.js';
import { PortableSettingsManager } from './portable-settings.js';

export interface LegacyV1Account {
  id: string;
  username: string;
  journal_title: string;
  avatar_url: string;
  access_token: string;
  backup_folder: string;
  schedule: PortableSchedule;
  gap_check_days: number;
  redo_count: number;
  api_delay_ms: number;
  last_backup_at: string | null;
  total_archived: number;
  journal_entry_total: number;
  rag_state: 'green' | 'amber' | 'red';
  error_message: string | null;
}

export interface LegacyV1Shape {
  accounts?: LegacyV1Account[];
  ui?: { thumbnailSizePercent?: number; accountOrder?: string[] };
  app?: { startWithWindows?: boolean };
}

export interface V1MigrationResult {
  canonicalFolder: string;
  startWithWindows: boolean;
  tokens: Record<string, string>;
  status: Record<string, AccountStatus>;
  portableSettings: BArkSettings;
}

/**
 * Pure function: given the legacy v1 store shape, return the split v2 outputs
 * (local-store fields + portable settings). No electron-store / fs side
 * effects — wrapped by migrateFromV1IfNeeded() which performs the writes.
 */
export function migrateV1Shape(legacy: LegacyV1Shape): V1MigrationResult {
  const legacyAccounts = legacy.accounts ?? [];
  const legacyUi = legacy.ui ?? {};
  const legacyApp = legacy.app ?? {};

  // Pick the canonical backup folder = first account's non-empty backup_folder.
  // Other accounts' folder values are intentionally dropped.
  const canonicalFolder = legacyAccounts.find((a) => a.backup_folder)?.backup_folder ?? '';

  // Pick canonical shared knobs from the first account; fall back to defaults
  // for an empty array.
  const fallback = PortableSettingsManager.defaults();
  const first = legacyAccounts[0];
  const sharedSchedule: PortableSchedule = first?.schedule ?? fallback.schedule;
  const apiDelay = first?.api_delay_ms ?? fallback.api_delay_ms;
  const gapCheck = first?.gap_check_days ?? fallback.gap_check_days;
  const redo = first?.redo_count ?? fallback.redo_count;
  const thumb = legacyUi.thumbnailSizePercent ?? fallback.ui.thumbnail_size_percent;
  const accountOrder = legacyUi.accountOrder ?? legacyAccounts.map((a) => a.id);

  const portableAccounts: PortableAccount[] = legacyAccounts.map((a) => ({
    id: a.id,
    username: a.username,
    journal_title: a.journal_title,
    avatar_url: a.avatar_url,
  }));

  const tokens: Record<string, string> = {};
  const status: Record<string, AccountStatus> = {};
  for (const a of legacyAccounts) {
    if (a.access_token) tokens[a.username] = a.access_token;
    status[a.id] = {
      last_backup_at: a.last_backup_at,
      last_entry_date: null,
      total_archived: a.total_archived,
      journal_entry_total: a.journal_entry_total,
      rag_state: a.rag_state,
      error_message: a.error_message,
      account_added_at: null,
    };
  }

  const portableSettings: BArkSettings = {
    schema_version: B_ARK_SETTINGS_SCHEMA_VERSION,
    accounts: portableAccounts,
    account_order: accountOrder,
    schedule: sharedSchedule,
    api_delay_ms: apiDelay,
    gap_check_days: gapCheck,
    redo_count: redo,
    ui: { thumbnail_size_percent: thumb, show_info_overlay: true },
  };

  return {
    canonicalFolder,
    startWithWindows: legacyApp.startWithWindows ?? true,
    tokens,
    status,
    portableSettings,
  };
}
