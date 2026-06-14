// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import {
  buildAppStore,
  buildBackupConfig,
  nextBackupCaption,
  describeBackupError,
} from '../store-builder.js';

const token = { username: 'gbradley', accessToken: 'tok' };

describe('buildAppStore', () => {
  it('returns no accounts when signed out', () => {
    const store = buildAppStore({
      token: null,
      folderName: '',
      settings: {},
      status: {},
      archived: 0,
      entryTotal: 0,
      lastEntryDate: null,
      backupOnPublish: false,
    });
    expect(store.accounts).toEqual([]);
    expect(store.ui.accountOrder).toEqual([]);
  });

  it('builds a single account from token + settings + journal-derived counts', () => {
    const store = buildAppStore({
      token,
      folderName: 'Backups',
      settings: { journal_title: 'My Journal', gap_check_days: 14, redo_count: 3 },
      status: { last_backup_at: '2024-01-10T00:00:00Z', rag_state: 'green' },
      archived: 42,
      entryTotal: 100,
      lastEntryDate: '2024-01-09',
      backupOnPublish: false,
    });
    expect(store.accounts).toHaveLength(1);
    const a = store.accounts[0];
    expect(a.id).toBe('gbradley');
    expect(a.journal_title).toBe('My Journal');
    expect(a.backup_folder).toBe('Backups');
    expect(a.total_archived).toBe(42);
    expect(a.journal_entry_total).toBe(100);
    expect(a.last_entry_date).toBe('2024-01-09');
    expect(a.gap_check_days).toBe(14);
    expect(a.redo_count).toBe(3);
    expect(store.ui.accountOrder).toEqual(['gbradley']);
  });

  it('falls back to the username for the title when none is set', () => {
    const store = buildAppStore({
      token,
      folderName: '',
      settings: {},
      status: {},
      archived: 0,
      entryTotal: 0,
      lastEntryDate: null,
      backupOnPublish: false,
    });
    expect(store.accounts[0].journal_title).toBe('gbradley');
    expect(store.accounts[0].rag_state).toBe('green');
  });
});

describe('nextBackupCaption', () => {
  it('is Manual when neither trigger is enabled', () => {
    expect(nextBackupCaption(false, false, null, 'weekly')).toBe('Manual');
  });

  it('is "On publish" when only publish is enabled', () => {
    expect(nextBackupCaption(false, true, null, 'weekly')).toBe('On publish');
  });

  it('is "On next visit" when only schedule is enabled and never backed up', () => {
    expect(nextBackupCaption(true, false, null, 'weekly')).toBe('On next visit');
  });

  it('combines publish + due visit without duplicating the "On visit after" prefix', () => {
    // A far-future last backup makes the visit pending, exercising the prefix-strip branch.
    const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const caption = nextBackupCaption(true, true, future, 'weekly');
    expect(caption.startsWith('On publish, or visit after ')).toBe(true);
    expect(caption).not.toContain('or On visit after');
  });

  it('collapses to "On publish, or next visit" when a visit is already due', () => {
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
    expect(nextBackupCaption(true, true, old, 'weekly')).toBe('On publish, or next visit');
  });
});

describe('buildBackupConfig', () => {
  it('uses the live profile title/avatar and fixed metadata_write_interval', () => {
    const config = buildBackupConfig({
      token,
      settings: { redo_count: 9, gap_check_days: 21, api_delay_ms: 250 },
      appVersion: '1.2.3',
      journalTitle: 'Fresh Title',
      avatarUrl: 'https://img/a.jpg',
    });
    expect(config.journal_title).toBe('Fresh Title');
    expect(config.avatar_url).toBe('https://img/a.jpg');
    expect(config.redo_count).toBe(9);
    expect(config.gap_check_days).toBe(21);
    expect(config.api_delay_ms).toBe(250);
    expect(config.metadata_write_interval).toBe(5);
    expect(config.app_version).toBe('1.2.3');
  });
});

describe('describeBackupError', () => {
  it('maps each error kind to a message', () => {
    expect(
      describeBackupError({ type: 'failed', account_id: 'x', error: { kind: 'auth_expired' } }),
    ).toContain('reauthorise');
    expect(
      describeBackupError({
        type: 'failed',
        account_id: 'x',
        error: { kind: 'api_error', code: 500, message: 'boom' },
      }),
    ).toBe('API error 500: boom');
  });
});
