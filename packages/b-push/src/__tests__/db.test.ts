// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './testDb.js';
import {
  insertRegistration,
  getRegistrationById,
  deleteRegistration,
  updateReadToken,
  updateDeviceToken,
  updatePollInterval,
  markPolled,
  markReauthRequired,
  updateCachedPrefs,
  listDueRegistrations,
  listActiveRegistrations,
} from '../db.js';
import type { RegistrationRow } from '../types.js';

function row(overrides: Partial<RegistrationRow> = {}): RegistrationRow {
  return {
    id: 'reg-1',
    secret_hash: 'hash',
    blipfoto_user_id: 'gbradley',
    read_token_ciphertext: 'ct',
    read_token_nonce: 'n',
    device_token: 'device-token',
    platform: 'android',
    poll_interval_minutes: 5,
    last_polled_at: null,
    last_seen_comments_total: 0,
    last_seen_notifications_total: 0,
    cached_push_prefs: null,
    prefs_fetched_at: null,
    status: 'active',
    created_at: 1000,
    ...overrides,
  };
}

let db: TestDb;

beforeEach(() => {
  db = createTestDb();
});

afterEach(() => {
  db.close();
});

describe('insertRegistration / getRegistrationById / deleteRegistration', () => {
  it('round-trips a row', async () => {
    await insertRegistration(db, row());
    const found = await getRegistrationById(db, 'reg-1');
    expect(found).toMatchObject({ id: 'reg-1', blipfoto_user_id: 'gbradley' });
  });

  it('returns null for an unknown id', async () => {
    expect(await getRegistrationById(db, 'nope')).toBeNull();
  });

  it('deleteRegistration is a real removal', async () => {
    await insertRegistration(db, row());
    await deleteRegistration(db, 'reg-1');
    expect(await getRegistrationById(db, 'reg-1')).toBeNull();
  });
});

describe('updateReadToken / updateDeviceToken / updatePollInterval', () => {
  it('updateReadToken also resets status to active', async () => {
    await insertRegistration(db, row({ status: 'read-token-invalid' }));
    await updateReadToken(db, 'reg-1', 'new-ct', 'new-nonce');
    const found = await getRegistrationById(db, 'reg-1');
    expect(found).toMatchObject({
      read_token_ciphertext: 'new-ct',
      read_token_nonce: 'new-nonce',
      status: 'active',
    });
  });

  it('updateDeviceToken updates only the device token', async () => {
    await insertRegistration(db, row());
    await updateDeviceToken(db, 'reg-1', 'rotated-token');
    const found = await getRegistrationById(db, 'reg-1');
    expect(found?.device_token).toBe('rotated-token');
  });

  it('updatePollInterval floors below 5 and rounds fractional values', async () => {
    await insertRegistration(db, row());
    await updatePollInterval(db, 'reg-1', 2);
    expect((await getRegistrationById(db, 'reg-1'))?.poll_interval_minutes).toBe(5);

    await updatePollInterval(db, 'reg-1', 7.6);
    expect((await getRegistrationById(db, 'reg-1'))?.poll_interval_minutes).toBe(8);
  });
});

describe('markPolled / markReauthRequired / updateCachedPrefs', () => {
  it('markPolled stores the new totals and timestamp', async () => {
    await insertRegistration(db, row());
    await markPolled(db, 'reg-1', 5000, 3, 7);
    const found = await getRegistrationById(db, 'reg-1');
    expect(found).toMatchObject({
      last_polled_at: 5000,
      last_seen_comments_total: 3,
      last_seen_notifications_total: 7,
    });
  });

  it('markReauthRequired flips status and stops the row being due', async () => {
    await insertRegistration(db, row({ last_polled_at: 0, poll_interval_minutes: 5 }));
    await markReauthRequired(db, 'reg-1', 10_000);
    const found = await getRegistrationById(db, 'reg-1');
    expect(found?.status).toBe('read-token-invalid');

    const due = await listDueRegistrations(db, 10_000_000);
    expect(due).toHaveLength(0);
  });

  it('updateCachedPrefs stores the JSON string and fetch time', async () => {
    await insertRegistration(db, row());
    await updateCachedPrefs(db, 'reg-1', JSON.stringify({ configured: false }), 9000);
    const found = await getRegistrationById(db, 'reg-1');
    expect(found?.cached_push_prefs).toBe('{"configured":false}');
    expect(found?.prefs_fetched_at).toBe(9000);
  });
});

describe('listDueRegistrations', () => {
  it('includes a never-polled row', async () => {
    await insertRegistration(db, row({ last_polled_at: null }));
    const due = await listDueRegistrations(db, 1_000_000);
    expect(due.map((r) => r.id)).toEqual(['reg-1']);
  });

  it('excludes a row polled more recently than its interval', async () => {
    await insertRegistration(db, row({ last_polled_at: 1_000_000, poll_interval_minutes: 5 }));
    // 1 minute later — under the 5-minute interval.
    const due = await listDueRegistrations(db, 1_000_000 + 60_000);
    expect(due).toHaveLength(0);
  });

  it('includes a row whose interval has fully elapsed', async () => {
    await insertRegistration(db, row({ last_polled_at: 1_000_000, poll_interval_minutes: 5 }));
    const due = await listDueRegistrations(db, 1_000_000 + 5 * 60_000);
    expect(due.map((r) => r.id)).toEqual(['reg-1']);
  });

  it('excludes an inactive (read-token-invalid) row regardless of timing', async () => {
    await insertRegistration(db, row({ status: 'read-token-invalid', last_polled_at: null }));
    expect(await listDueRegistrations(db, 1_000_000)).toHaveLength(0);
  });
});

describe('listActiveRegistrations', () => {
  it('returns only active rows, due or not', async () => {
    await insertRegistration(
      db,
      row({ id: 'a', last_polled_at: Date.now(), poll_interval_minutes: 60 }),
    );
    await insertRegistration(db, row({ id: 'b', status: 'read-token-invalid' }));
    const active = await listActiveRegistrations(db);
    expect(active.map((r) => r.id)).toEqual(['a']);
  });
});
