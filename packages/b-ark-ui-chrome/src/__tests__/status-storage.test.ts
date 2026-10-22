// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeStorageLocal, type FakeChromeStorage } from './helpers.js';
import {
  readStatus,
  setWorking,
  setOutstanding,
  setCancelledIncomplete,
  setCompleted,
  setFailed,
  setProgress,
  setAvatar,
  clearAll,
} from '../status-storage.js';

let fake: FakeChromeStorage;
beforeEach(() => {
  fake = installChromeStorageLocal();
});
afterEach(() => {
  fake.uninstall();
});

describe('status-storage transitions', () => {
  it('setWorking goes amber and clears the chip error', async () => {
    await setFailed('auth_expired', 'expired'); // start red
    await setWorking();
    expect((await readStatus()).rag_state).toBe('amber');
    expect(fake.store.get('chip_rag')).toBe('amber');
    expect(fake.store.get('chip_error_kind')).toBeNull();
  });

  it('setCompleted records green + last_backup_at + totals', async () => {
    await setCompleted('2024-02-03T10:00:00Z', 128);
    const status = await readStatus();
    expect(status.rag_state).toBe('green');
    expect(status.last_backup_at).toBe('2024-02-03T10:00:00Z');
    expect(status.total_archived).toBe(128);
    expect(fake.store.get('chip_rag')).toBe('green');
    expect(fake.store.get('chip_last_backup_at')).toBe('2024-02-03T10:00:00Z');
  });

  it('setCompleted with outstanding entries is amber with an outstanding reason, but not incomplete', async () => {
    await setWorking();
    await setCompleted('2024-02-03T10:00:00Z', 128, { retrying: 3, unavailable: 2, other: 1 });
    const status = await readStatus();
    expect(status.rag_state).toBe('amber');
    expect(status.error_message).toBeNull();
    expect(status.rag_reasons).toEqual([
      { code: 'outstanding', retrying: 3, unavailable: 2, other: 1 },
    ]);
    expect(status.total_archived).toBe(128);
    expect(fake.store.get('chip_rag')).toBe('amber');
    expect(fake.store.get('chip_incomplete')).toBe(false);
  });

  it('setOutstanding turns amber back to green once the only reason is gone, and never lowers red', async () => {
    await setCompleted('2024-02-03T10:00:00Z', 5, { retrying: 0, unavailable: 1, other: 0 });
    await setOutstanding(null);
    expect((await readStatus()).rag_state).toBe('green');
    expect(fake.store.get('chip_rag')).toBe('green');

    await setFailed('network', 'offline');
    await setOutstanding({ retrying: 1, unavailable: 0, other: 0 });
    expect((await readStatus()).rag_state).toBe('red');
  });

  it('setOutstanding keeps other reasons', async () => {
    await setCancelledIncomplete();
    await setOutstanding({ retrying: 1, unavailable: 0, other: 0 });
    expect((await readStatus()).rag_reasons).toEqual([
      { code: 'incomplete' },
      { code: 'outstanding', retrying: 1, unavailable: 0, other: 0 },
    ]);
  });

  it('a run that starts or is cancelled is marked incomplete until one completes', async () => {
    await setWorking();
    expect(fake.store.get('chip_incomplete')).toBe(true);
    await setCompleted('2024-02-03T10:00:00Z', 5);
    expect(fake.store.get('chip_incomplete')).toBe(false);
    await setCancelledIncomplete();
    expect(fake.store.get('chip_incomplete')).toBe(true);
  });

  it('setFailed maps the error kind to a chip label and goes red', async () => {
    await setFailed('filesystem', 'no permission');
    expect((await readStatus()).rag_state).toBe('red');
    expect((await readStatus()).error_message).toBe('no permission');
    expect(fake.store.get('chip_rag')).toBe('red');
    expect(fake.store.get('chip_error_kind')).toBe('permission');
  });

  it('setProgress writes the pill and clears the rate-limit reason', async () => {
    await setProgress({ done: 3, total: 10 });
    expect(fake.store.get('chip_progress')).toEqual({ done: 3, total: 10 });
    expect(fake.store.get('chip_amber_reason')).toBeNull();
  });

  it('clearAll removes b_ark_status and every chip_* key', async () => {
    await setCompleted('2024-02-03T10:00:00Z', 5);
    await setAvatar('data:image/png;base64,xxx');
    await clearAll();
    expect(fake.store.has('b_ark_status')).toBe(false);
    expect(fake.store.has('chip_rag')).toBe(false);
    expect(fake.store.has('chip_last_backup_at')).toBe(false);
    expect(fake.store.has('chip_avatar_url')).toBe(false);
  });
});
