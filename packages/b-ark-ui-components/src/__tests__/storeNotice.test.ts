// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import {
  STORE_HOW_IT_WORKS_URL,
  STORE_NOTICE_TEXT,
  STORE_URL,
  shouldShowStoreNotice,
} from '../storeNotice.js';
import type { AccountConfig } from '../backend.js';

const account = (rag_state: 'green' | 'amber' | 'red') => ({ rag_state }) as AccountConfig;

describe('Store notice wording and links', () => {
  it('has the agreed text and URLs', () => {
    expect(STORE_NOTICE_TEXT).toBe(
      'b-ark is now on the Microsoft Store. Switch to get updates automatically from the Store. Uninstall this version in Windows Settings > Apps, then install b-ark from the Store; your accounts, settings and backups carry over.',
    );
    expect(STORE_URL).toBe('https://apps.microsoft.com/detail/9P736ZD76DC5');
    expect(STORE_HOW_IT_WORKS_URL).toBe('https://b-oss.dev/b-ark');
  });
});

describe('shouldShowStoreNotice', () => {
  const on = { storeMigrationNotice: true, staleBackupNotice: null, accounts: [account('green')] };
  it('shows when offered and nothing more important is showing', () => {
    expect(shouldShowStoreNotice(on)).toBe(true);
  });
  it('does not show when not offered (Store build, dismissed or switched off)', () => {
    expect(shouldShowStoreNotice({ ...on, storeMigrationNotice: false })).toBe(false);
    expect(shouldShowStoreNotice({ ...on, storeMigrationNotice: undefined })).toBe(false);
  });
  it('yields to the stale-backup notice', () => {
    const stale = { lastBackupAt: '2026-11-01T00:00:00Z', daysSince: 5 };
    expect(shouldShowStoreNotice({ ...on, staleBackupNotice: stale })).toBe(false);
  });
  it('yields to an account needing attention', () => {
    expect(shouldShowStoreNotice({ ...on, accounts: [account('green'), account('amber')] })).toBe(
      false,
    );
    expect(shouldShowStoreNotice({ ...on, accounts: [account('red')] })).toBe(false);
  });
});
