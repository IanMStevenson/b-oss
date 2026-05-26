// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { migrateV1Shape, type LegacyV1Account } from '../migrate-store-pure.js';

function makeAccount(over: Partial<LegacyV1Account> = {}): LegacyV1Account {
  return {
    id: 'a1',
    username: 'alice',
    journal_title: 'Alice Journal',
    avatar_url: 'https://x/a.jpg',
    access_token: 'enc-token-alice',
    backup_folder: 'C:/backups',
    schedule: { enabled: true, next_run: '2026-06-01T02:00:00.000Z', hour: 2, interval: 'daily' },
    gap_check_days: 31,
    redo_count: 7,
    api_delay_ms: 0,
    last_backup_at: '2026-05-30T02:05:00.000Z',
    total_archived: 100,
    journal_entry_total: 100,
    rag_state: 'green',
    error_message: null,
    ...over,
  };
}

describe('migrateV1Shape (pure helper)', () => {
  it('zero-account legacy install → no folder, default shared settings', () => {
    const result = migrateV1Shape({ accounts: [] });
    expect(result.canonicalFolder).toBe('');
    expect(result.portableSettings.accounts).toEqual([]);
    expect(result.portableSettings.account_order).toEqual([]);
    expect(result.tokens).toEqual({});
    expect(result.status).toEqual({});
    // Default schedule from PortableSettingsManager.defaults
    expect(result.portableSettings.schedule.hour).toBe(2);
    expect(result.portableSettings.schedule.interval).toBe('daily');
  });

  it('one-account with folder → that folder is canonical', () => {
    const a = makeAccount({ id: 'acc-1', backup_folder: 'D:/data/b-ark' });
    const result = migrateV1Shape({ accounts: [a], app: { startWithWindows: false } });
    expect(result.canonicalFolder).toBe('D:/data/b-ark');
    expect(result.startWithWindows).toBe(false);
    expect(result.portableSettings.accounts).toEqual([
      {
        id: 'acc-1',
        username: 'alice',
        journal_title: 'Alice Journal',
        avatar_url: 'https://x/a.jpg',
      },
    ]);
    expect(result.tokens).toEqual({ alice: 'enc-token-alice' });
    expect(result.status).toEqual({
      'acc-1': {
        last_backup_at: '2026-05-30T02:05:00.000Z',
        total_archived: 100,
        journal_entry_total: 100,
        rag_state: 'green',
        error_message: null,
        account_added_at: null,
      },
    });
    // Shared knobs taken from this account
    expect(result.portableSettings.api_delay_ms).toBe(0);
    expect(result.portableSettings.gap_check_days).toBe(31);
    expect(result.portableSettings.redo_count).toBe(7);
  });

  it('two-account same folder → both accounts present, order preserved from ui.accountOrder', () => {
    const a = makeAccount({ id: 'acc-1', username: 'alice', backup_folder: 'C:/shared' });
    const b = makeAccount({
      id: 'acc-2',
      username: 'bob',
      journal_title: 'Bob Journal',
      avatar_url: 'https://x/b.jpg',
      access_token: 'enc-token-bob',
      backup_folder: 'C:/shared',
      last_backup_at: '2026-05-29T02:00:00.000Z',
      total_archived: 50,
      journal_entry_total: 60,
      rag_state: 'amber',
      error_message: 'Some warning',
    });
    const result = migrateV1Shape({
      accounts: [a, b],
      ui: { thumbnailSizePercent: 150, accountOrder: ['acc-2', 'acc-1'] },
    });
    expect(result.canonicalFolder).toBe('C:/shared');
    expect(result.portableSettings.accounts.map((p) => p.id).sort()).toEqual(['acc-1', 'acc-2']);
    expect(result.portableSettings.account_order).toEqual(['acc-2', 'acc-1']);
    expect(result.portableSettings.ui.thumbnail_size_percent).toBe(150);
    expect(result.tokens).toEqual({ alice: 'enc-token-alice', bob: 'enc-token-bob' });
    expect(result.status['acc-2']?.error_message).toBe('Some warning');
  });

  it('two-account different folders → first non-empty folder wins; other dropped', () => {
    const a = makeAccount({ id: 'acc-1', username: 'alice', backup_folder: 'C:/A' });
    const b = makeAccount({
      id: 'acc-2',
      username: 'bob',
      backup_folder: 'D:/B',
      access_token: 'enc-b',
    });
    const result = migrateV1Shape({ accounts: [a, b] });
    expect(result.canonicalFolder).toBe('C:/A');
    expect(result.portableSettings.accounts).toHaveLength(2);
    expect(result.tokens).toEqual({ alice: 'enc-token-alice', bob: 'enc-b' });
  });

  it('shared schedule/delay/gap/redo come from the first account, not later ones', () => {
    const a = makeAccount({
      id: 'acc-1',
      backup_folder: 'C:/data',
      schedule: {
        enabled: true,
        next_run: '2026-06-01T09:00:00.000Z',
        hour: 9,
        interval: 'weekly',
      },
      api_delay_ms: 500,
      gap_check_days: 14,
      redo_count: 3,
    });
    const b = makeAccount({
      id: 'acc-2',
      username: 'bob',
      schedule: {
        enabled: false,
        next_run: '2026-06-01T03:00:00.000Z',
        hour: 3,
        interval: 'monthly',
      },
      api_delay_ms: 0,
      gap_check_days: 90,
      redo_count: 20,
      backup_folder: 'C:/data',
    });
    const result = migrateV1Shape({ accounts: [a, b] });
    expect(result.portableSettings.schedule.hour).toBe(9);
    expect(result.portableSettings.schedule.interval).toBe('weekly');
    expect(result.portableSettings.api_delay_ms).toBe(500);
    expect(result.portableSettings.gap_check_days).toBe(14);
    expect(result.portableSettings.redo_count).toBe(3);
  });

  it('account without a folder still migrates with empty canonicalFolder', () => {
    // A user who added an account but never picked a folder
    const a = makeAccount({ id: 'acc-1', backup_folder: '' });
    const result = migrateV1Shape({ accounts: [a] });
    expect(result.canonicalFolder).toBe('');
    expect(result.portableSettings.accounts).toHaveLength(1);
    expect(result.tokens).toEqual({ alice: 'enc-token-alice' });
  });

  it('missing ui falls back to account-insertion order for account_order', () => {
    const a = makeAccount({ id: 'acc-1', backup_folder: 'C:/d' });
    const b = makeAccount({ id: 'acc-2', username: 'bob', backup_folder: 'C:/d' });
    const result = migrateV1Shape({ accounts: [a, b] });
    expect(result.portableSettings.account_order).toEqual(['acc-1', 'acc-2']);
  });

  it('account without access_token is migrated but excluded from tokens map', () => {
    const a = makeAccount({ id: 'acc-1', backup_folder: 'C:/d', access_token: '' });
    const result = migrateV1Shape({ accounts: [a] });
    expect(result.tokens).toEqual({});
    expect(result.portableSettings.accounts).toHaveLength(1);
    expect(result.status['acc-1']).toBeDefined();
  });
});
