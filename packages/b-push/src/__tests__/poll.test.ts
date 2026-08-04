// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// FCM sending itself is fcm.test.ts's job — mocked wholesale here so these tests exercise only
// the poll tick's own logic (which registrations are due, the delta/push-gate decision, the
// reauth-required branch), the same "mock at the boundary" split used throughout.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from './testDb.js';
import { insertRegistration, getRegistrationById } from '../db.js';
import { runActivityPoll } from '../poll.js';
import type { Env, RegistrationRow } from '../types.js';

const sendFcmMessage = vi.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
vi.mock('../fcm.js', () => ({
  sendFcmMessage: (...args: unknown[]) => sendFcmMessage(...args),
}));

function testKeyBase64(): string {
  const bytes = new Uint8Array(32).fill(5);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function testEnv(): Env {
  return {
    DB: undefined as never,
    READ_TOKEN_ENCRYPTION_KEY: testKeyBase64(),
    REGISTRATION_SECRET: '',
    FCM_SERVICE_ACCOUNT_JSON: '{}',
  };
}

let db: TestDb;
let env: Env;

async function seedRow(overrides: Partial<RegistrationRow> = {}): Promise<void> {
  const { importEncryptionKey, encryptReadToken } = await import('../crypto.js');
  const key = await importEncryptionKey(env.READ_TOKEN_ENCRYPTION_KEY);
  const { ciphertext, nonce } = await encryptReadToken('a-real-read-token', key);
  await insertRegistration(db, {
    id: 'reg-1',
    secret_hash: 'hash',
    blipfoto_user_id: 'gbradley',
    read_token_ciphertext: ciphertext,
    read_token_nonce: nonce,
    device_token: 'device-1',
    platform: 'android',
    poll_interval_minutes: 5,
    last_polled_at: null,
    last_seen_comments_total: 0,
    last_seen_notifications_total: 0,
    cached_push_prefs: JSON.stringify({ configured: true }),
    prefs_fetched_at: null,
    status: 'active',
    created_at: 0,
    ...overrides,
  });
}

function mockUnreadTotals(comments: number, notifications: number): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ data: { comments, notifications }, error: null }), {
      status: 200,
    }),
  );
}

function mockTokenInvalid(): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ data: null, error: { code: 51, message: 'bad token' } }), {
      status: 200,
    }),
  );
}

beforeEach(() => {
  db = createTestDb();
  env = testEnv();
  sendFcmMessage.mockClear();
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

describe('runActivityPoll', () => {
  it('does nothing when no registration is due', async () => {
    const summary = await runActivityPoll(db, env, () => 1_000_000);
    expect(summary).toEqual({ due: 0, polled: 0, pushed: 0, reauthRequired: 0, errors: 0 });
    expect(sendFcmMessage).not.toHaveBeenCalled();
  });

  it('pushes once per stream whose total rose, and stores the new totals', async () => {
    await seedRow({ last_seen_comments_total: 1, last_seen_notifications_total: 2 });
    mockUnreadTotals(3, 2); // comments rose (1 -> 3), notifications unchanged
    const summary = await runActivityPoll(db, env, () => 5_000_000);

    expect(summary).toMatchObject({ due: 1, polled: 1, pushed: 1, reauthRequired: 0, errors: 0 });
    expect(sendFcmMessage).toHaveBeenCalledTimes(1);
    expect(sendFcmMessage).toHaveBeenCalledWith(
      env,
      'device-1',
      expect.objectContaining({ kind: 'activity', stream: 'comments', count: 2 }),
    );

    const row = await getRegistrationById(db, 'reg-1');
    expect(row).toMatchObject({
      last_polled_at: 5_000_000,
      last_seen_comments_total: 3,
      last_seen_notifications_total: 2,
    });
  });

  it('pushes for both streams independently when both rise', async () => {
    await seedRow();
    mockUnreadTotals(2, 5);
    const summary = await runActivityPoll(db, env, () => 1_000_000);
    expect(summary.pushed).toBe(2);
    expect(sendFcmMessage).toHaveBeenCalledTimes(2);
  });

  it('never pushes for a falling or unchanged total', async () => {
    await seedRow({ last_seen_comments_total: 5, last_seen_notifications_total: 5 });
    mockUnreadTotals(5, 3); // comments unchanged, notifications fell
    const summary = await runActivityPoll(db, env, () => 1_000_000);
    expect(summary.pushed).toBe(0);
    expect(sendFcmMessage).not.toHaveBeenCalled();
  });

  it('skips sending (but still records the new totals) when push is not configured', async () => {
    await seedRow({ cached_push_prefs: JSON.stringify({ configured: false }) });
    mockUnreadTotals(9, 9);
    const summary = await runActivityPoll(db, env, () => 1_000_000);
    expect(summary.pushed).toBe(0);
    expect(sendFcmMessage).not.toHaveBeenCalled();
    const row = await getRegistrationById(db, 'reg-1');
    expect(row?.last_seen_comments_total).toBe(9);
  });

  it('treats a never-fetched prefs cache as push-allowed by default', async () => {
    await seedRow({ cached_push_prefs: null, last_seen_comments_total: 0 });
    mockUnreadTotals(1, 0);
    await runActivityPoll(db, env, () => 1_000_000);
    expect(sendFcmMessage).toHaveBeenCalledTimes(1);
  });

  it('on a dead read token: marks read-token-invalid, sends exactly one reauth-required push, and excludes the row from the next tick', async () => {
    await seedRow();
    mockTokenInvalid();
    const summary = await runActivityPoll(db, env, () => 1_000_000);

    expect(summary).toMatchObject({ reauthRequired: 1, polled: 0, pushed: 0 });
    expect(sendFcmMessage).toHaveBeenCalledTimes(1);
    expect(sendFcmMessage).toHaveBeenCalledWith(
      env,
      'device-1',
      expect.objectContaining({ kind: 'reauth-required', accountId: 'gbradley' }),
    );

    const row = await getRegistrationById(db, 'reg-1');
    expect(row?.status).toBe('read-token-invalid');

    sendFcmMessage.mockClear();
    const nextTick = await runActivityPoll(db, env, () => 2_000_000);
    expect(nextTick.due).toBe(0);
    expect(sendFcmMessage).not.toHaveBeenCalled();
  });

  it("one registration's failure does not abort the rest of the batch", async () => {
    await seedRow({ id: 'reg-1', device_token: 'device-1' });
    await seedRow({ id: 'reg-2', device_token: 'device-2' });
    let call = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      call++;
      if (call === 1) return Promise.reject(new Error('transient network failure'));
      return Promise.resolve(
        new Response(JSON.stringify({ data: { comments: 1, notifications: 0 }, error: null }), {
          status: 200,
        }),
      );
    });
    const summary = await runActivityPoll(db, env, () => 1_000_000);
    expect(summary.errors).toBe(1);
    expect(summary.polled).toBe(1);
  });
});
