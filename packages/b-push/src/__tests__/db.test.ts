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
  updateStreamToggles,
  listDueRegistrations,
  POLL_BATCH_LIMIT,
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
    push_comments: 1,
    push_notifications: 1,
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

describe('markPolled / markReauthRequired', () => {
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
});

describe('updateStreamToggles (b-oss#244)', () => {
  it('sets only the toggle supplied, as 0/1', async () => {
    await insertRegistration(db, row());
    await updateStreamToggles(db, 'reg-1', { pushComments: false });
    expect(await getRegistrationById(db, 'reg-1')).toMatchObject({
      push_comments: 0,
      push_notifications: 1,
    });
    await updateStreamToggles(db, 'reg-1', { pushComments: true, pushNotifications: false });
    expect(await getRegistrationById(db, 'reg-1')).toMatchObject({
      push_comments: 1,
      push_notifications: 0,
    });
  });

  it('defaults both toggles on for a row inserted without them (the migration path)', async () => {
    // What an insert from the old Worker looks like once 0002 has run: no toggle columns named.
    await db
      .prepare(
        `INSERT INTO registrations (id, secret_hash, blipfoto_user_id, read_token_ciphertext,
           read_token_nonce, device_token, platform, created_at)
         VALUES ('old', 'h', 'u', 'c', 'n', 'd', 'android', 0)`,
      )
      .bind()
      .run();
    expect(await getRegistrationById(db, 'old')).toMatchObject({
      push_comments: 1,
      push_notifications: 1,
    });
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

  it('returns the longest-waiting rows first, never-polled ahead of all', async () => {
    await insertRegistration(db, row({ id: 'recent', last_polled_at: 3_000 }));
    await insertRegistration(db, row({ id: 'never', last_polled_at: null }));
    await insertRegistration(db, row({ id: 'oldest', last_polled_at: 1_000 }));
    await insertRegistration(db, row({ id: 'middle', last_polled_at: 2_000 }));
    const due = await listDueRegistrations(db, 10_000_000);
    expect(due.map((r) => r.id)).toEqual(['never', 'oldest', 'middle', 'recent']);
  });

  it('caps the batch at the limit, defaulting to POLL_BATCH_LIMIT', async () => {
    for (let i = 0; i < POLL_BATCH_LIMIT + 3; i++) {
      await insertRegistration(db, row({ id: `reg-${i}`, last_polled_at: i }));
    }
    expect(await listDueRegistrations(db, 10_000_000)).toHaveLength(POLL_BATCH_LIMIT);
    const two = await listDueRegistrations(db, 10_000_000, 2);
    expect(two.map((r) => r.id)).toEqual(['reg-0', 'reg-1']);
  });
});
