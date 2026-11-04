// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { checkStaleBackup, thresholdDays, type StaleCheckInput } from '../stale-backup.js';

const NOW = new Date('2026-11-12T10:00:00Z');
const daysAgo = (n: number): string => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function input(over: Partial<StaleCheckInput> = {}): StaleCheckInput {
  return {
    accounts: [{ last_backup_at: daysAgo(9), rag_state: 'green' }],
    schedule: { enabled: true, interval: 'daily' },
    intervals: 3,
    now: NOW,
    ...over,
  };
}

describe('thresholdDays', () => {
  it('is intervals x length, with a 3-day floor', () => {
    expect(thresholdDays(3, 'daily')).toBe(3);
    expect(thresholdDays(2, 'daily')).toBe(3);
    expect(thresholdDays(3, 'weekly')).toBe(21);
    expect(thresholdDays(2, 'monthly')).toBe(60);
  });
});

describe('checkStaleBackup', () => {
  it('flags a gap past the threshold', () => {
    const n = checkStaleBackup(input());
    expect(n).toMatchObject({ daysSince: 9 });
    expect(n?.lastBackupAt).toBe(daysAgo(9));
  });

  it('does not flag a long weekend on a daily schedule', () => {
    expect(
      checkStaleBackup(input({ accounts: [{ last_backup_at: daysAgo(3), rag_state: 'green' }] })),
    ).toBeNull();
  });

  it('flags just over the threshold', () => {
    expect(
      checkStaleBackup(input({ accounts: [{ last_backup_at: daysAgo(3.5), rag_state: 'green' }] })),
    ).not.toBeNull();
  });

  it('scales with the schedule interval', () => {
    const accounts = [{ last_backup_at: daysAgo(9), rag_state: 'green' as const }];
    expect(
      checkStaleBackup(input({ accounts, schedule: { enabled: true, interval: 'weekly' } })),
    ).toBeNull();
  });

  it('is off when intervals is 0', () => {
    expect(checkStaleBackup(input({ intervals: 0 }))).toBeNull();
  });

  it('is off when the schedule is disabled', () => {
    expect(checkStaleBackup(input({ schedule: { enabled: false, interval: 'daily' } }))).toBeNull();
  });

  it('ignores accounts with no backup yet, and never alerts when none have one', () => {
    expect(
      checkStaleBackup(input({ accounts: [{ last_backup_at: null, rag_state: 'amber' }] })),
    ).toBeNull();
    const n = checkStaleBackup(
      input({
        accounts: [
          { last_backup_at: null, rag_state: 'amber' },
          { last_backup_at: daysAgo(10), rag_state: 'green' },
        ],
      }),
    );
    expect(n?.daysSince).toBe(10);
  });

  it('uses the oldest backup across accounts', () => {
    const n = checkStaleBackup(
      input({
        accounts: [
          { last_backup_at: daysAgo(1), rag_state: 'green' },
          { last_backup_at: daysAgo(12), rag_state: 'amber' },
        ],
      }),
    );
    expect(n?.daysSince).toBe(12);
  });

  it('ignores signed-out (red) accounts: the red banner covers them', () => {
    expect(
      checkStaleBackup(input({ accounts: [{ last_backup_at: daysAgo(30), rag_state: 'red' }] })),
    ).toBeNull();
  });

  it('never alerts for a last backup in the future (clock moved) or an invalid date', () => {
    expect(
      checkStaleBackup(input({ accounts: [{ last_backup_at: daysAgo(-5), rag_state: 'green' }] })),
    ).toBeNull();
    expect(
      checkStaleBackup(input({ accounts: [{ last_backup_at: 'garbage', rag_state: 'green' }] })),
    ).toBeNull();
    expect(checkStaleBackup(input({ now: new Date('nope') }))).toBeNull();
  });
});
