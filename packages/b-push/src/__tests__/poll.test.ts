// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// FCM sending itself is fcm.test.ts's job — mocked wholesale here so these tests exercise only
// the poll tick's own logic (which registrations are due, the delta/push-gate decision, the
// reauth-required branch), the same "mock at the boundary" split used throughout.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from './testDb.js';
import { insertRegistration, getRegistrationById } from '../db.js';
import { runActivityPoll } from '../poll.js';
import { DeviceUnregisteredError } from '../fcm.js';
import type { Env, RegistrationRow } from '../types.js';

const sendFcmMessage = vi.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
vi.mock('../fcm.js', async () => ({
  ...(await vi.importActual<typeof import('../fcm.js')>('../fcm.js')),
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
    push_comments: 1,
    push_notifications: 1,
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
    expect(summary).toEqual({
      due: 0,
      polled: 0,
      pushed: 0,
      reauthRequired: 0,
      removed: 0,
      errors: 0,
    });
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

  it('pushes for every user regardless of Blipfoto push settings: it never reads them (b-oss#244)', async () => {
    // The old gate suppressed every push when Blipfoto's push.configured was 0, i.e. for anyone
    // who had never used Blipfoto's own app with push. The only Blipfoto call now is the totals.
    await seedRow();
    mockUnreadTotals(1, 1);
    await runActivityPoll(db, env, () => 1_000_000);
    expect(sendFcmMessage).toHaveBeenCalledTimes(2);
    const fetchMock = vi.mocked(globalThis.fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0] as string).toContain('messages/totals/unread');
  });

  it('skips the comments push when push_comments is off, but still records the new total (b-oss#244)', async () => {
    await seedRow({ push_comments: 0 });
    mockUnreadTotals(4, 2);
    const summary = await runActivityPoll(db, env, () => 1_000_000);
    expect(summary.pushed).toBe(1);
    expect(sendFcmMessage).toHaveBeenCalledTimes(1);
    expect(sendFcmMessage).toHaveBeenCalledWith(
      env,
      'device-1',
      expect.objectContaining({ stream: 'notifications', count: 2 }),
    );
    expect(await getRegistrationById(db, 'reg-1')).toMatchObject({
      last_seen_comments_total: 4,
      last_seen_notifications_total: 2,
    });
  });

  it('skips the notifications push when push_notifications is off, but still records the new total (b-oss#244)', async () => {
    await seedRow({ push_notifications: 0 });
    mockUnreadTotals(1, 6);
    const summary = await runActivityPoll(db, env, () => 1_000_000);
    expect(summary.pushed).toBe(1);
    expect(sendFcmMessage).toHaveBeenCalledWith(
      env,
      'device-1',
      expect.objectContaining({ stream: 'comments', count: 1 }),
    );
    expect((await getRegistrationById(db, 'reg-1'))?.last_seen_notifications_total).toBe(6);
  });

  it('with both streams off: still polls and records totals, pushes nothing, and a re-enabled stream sends no stale catch-up (b-oss#244)', async () => {
    await seedRow({ push_comments: 0, push_notifications: 0 });
    mockUnreadTotals(3, 3);
    const summary = await runActivityPoll(db, env, () => 1_000_000);
    expect(summary).toMatchObject({ due: 1, polled: 1, pushed: 0 });
    expect(sendFcmMessage).not.toHaveBeenCalled();

    // Turn comments back on; nothing new arrives, so the next tick must not push the 3 that
    // came in while it was off.
    await db.prepare('UPDATE registrations SET push_comments = 1').bind().run();
    const next = await runActivityPoll(db, env, () => 1_000_000 + 5 * 60_000);
    expect(next.pushed).toBe(0);
    expect(sendFcmMessage).not.toHaveBeenCalled();
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

  it('a read token encrypted under another key ends up reauth-required with exactly one push (b-oss#252)', async () => {
    await seedRow();
    const rotated = {
      ...env,
      READ_TOKEN_ENCRYPTION_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(9))),
    };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const summary = await runActivityPoll(db, rotated, () => 1_000_000);

    expect(summary).toMatchObject({ reauthRequired: 1, polled: 0, errors: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sendFcmMessage).toHaveBeenCalledTimes(1);
    expect(sendFcmMessage).toHaveBeenCalledWith(
      rotated,
      'device-1',
      expect.objectContaining({ kind: 'reauth-required', accountId: 'gbradley' }),
    );
    expect((await getRegistrationById(db, 'reg-1'))?.status).toBe('read-token-invalid');

    sendFcmMessage.mockClear();
    expect((await runActivityPoll(db, rotated, () => 2_000_000)).due).toBe(0);
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

  it('treats code 52 on a stored token as an ordinary error: row stays active, no reauth push (b-oss#238)', async () => {
    // A revoked user token is 51 (Blipfoto source). A 52 on a token that was accepted at
    // registration would point at something wider (e.g. the client being rejected) and would hit
    // every row at once, so it must not mark rows dead or tell every user to sign in again.
    await seedRow({ last_seen_comments_total: 0 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ data: null, error: { code: 52, message: 'The client is invalid.' } }),
        { status: 200 },
      ),
    );
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const summary = await runActivityPoll(db, env, () => 5_000_000);

    expect(summary).toMatchObject({ due: 1, polled: 0, reauthRequired: 0, errors: 1 });
    expect(sendFcmMessage).not.toHaveBeenCalled();
    const row = await getRegistrationById(db, 'reg-1');
    expect(row?.status).toBe('active');
    expect(logged.mock.calls.map((args) => args.join(' ')).join('\n')).toContain(
      'BlipfotoError 52',
    );
  });

  it('logs a failed registration by id, never with its read token (b-oss#238)', async () => {
    await seedRow();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const summary = await runActivityPoll(db, env, () => 5_000_000);
    expect(summary.errors).toBe(1);
    const lines = logged.mock.calls.map((args) => args.join(' '));
    expect(lines.some((l) => l.includes('reg-1'))).toBe(true);
    expect(lines.join('\n')).not.toContain('a-real-read-token');
  });

  it('deletes a registration whose device FCM reports unregistered (b-oss#265)', async () => {
    // App uninstalled or its data cleared: it can't DELETE its own row any more, so the poll must,
    // or the service keeps polling with that read token forever.
    await seedRow({ last_seen_comments_total: 0 });
    mockUnreadTotals(1, 0);
    sendFcmMessage.mockRejectedValueOnce(new DeviceUnregisteredError());
    const summary = await runActivityPoll(db, env, () => 5_000_000);
    expect(summary).toMatchObject({ due: 1, removed: 1, errors: 0 });
    expect(await getRegistrationById(db, 'reg-1')).toBeNull();
  });

  it('also deletes it when the reauth push finds the device gone (b-oss#265)', async () => {
    await seedRow();
    mockTokenInvalid();
    sendFcmMessage.mockRejectedValueOnce(new DeviceUnregisteredError());
    await runActivityPoll(db, env, () => 5_000_000);
    expect(await getRegistrationById(db, 'reg-1')).toBeNull();
  });

  it('keeps the registration for any other FCM failure (b-oss#265)', async () => {
    await seedRow({ last_seen_comments_total: 0 });
    mockUnreadTotals(1, 0);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sendFcmMessage.mockRejectedValueOnce(new Error('FCM send failed: 400 INVALID_ARGUMENT'));
    const summary = await runActivityPoll(db, env, () => 5_000_000);
    expect(summary).toMatchObject({ removed: 0, errors: 1 });
    expect(await getRegistrationById(db, 'reg-1')).not.toBeNull();
  });

  it('keeps the old total when a push fails, so the next poll sends it again', async () => {
    await seedRow({ last_seen_comments_total: 1, last_seen_notifications_total: 0 });
    mockUnreadTotals(4, 0);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sendFcmMessage.mockRejectedValueOnce(new Error('Too many subrequests'));

    const first = await runActivityPoll(db, env, () => 1_000_000);
    expect(first).toMatchObject({ polled: 0, pushed: 0, errors: 1 });
    expect(await getRegistrationById(db, 'reg-1')).toMatchObject({
      last_polled_at: 1_000_000,
      last_seen_comments_total: 1,
    });

    vi.mocked(globalThis.fetch).mockRestore();
    mockUnreadTotals(4, 0);
    const second = await runActivityPoll(db, env, () => 1_000_000 + 5 * 60_000);
    expect(second.pushed).toBe(1);
    expect(sendFcmMessage).toHaveBeenLastCalledWith(
      env,
      'device-1',
      expect.objectContaining({ stream: 'comments', count: 3 }),
    );
    expect((await getRegistrationById(db, 'reg-1'))?.last_seen_comments_total).toBe(4);
  });

  it('stores a sent stream but not a failed one when only the second push fails', async () => {
    await seedRow();
    mockUnreadTotals(2, 5);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sendFcmMessage
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('FCM send failed: 503'));

    const summary = await runActivityPoll(db, env, () => 1_000_000);
    expect(summary.errors).toBe(1);
    expect(await getRegistrationById(db, 'reg-1')).toMatchObject({
      last_seen_comments_total: 2,
      last_seen_notifications_total: 0,
    });
  });

  it('does not try the second push after the first fails, and keeps both totals', async () => {
    await seedRow();
    mockUnreadTotals(2, 5);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sendFcmMessage.mockRejectedValueOnce(new Error('Too many subrequests'));

    await runActivityPoll(db, env, () => 1_000_000);
    expect(sendFcmMessage).toHaveBeenCalledTimes(1);
    expect(await getRegistrationById(db, 'reg-1')).toMatchObject({
      last_seen_comments_total: 0,
      last_seen_notifications_total: 0,
    });
  });

  it('still stores the total of a switched-off stream when the other push fails', async () => {
    await seedRow({ push_notifications: 0 });
    mockUnreadTotals(2, 5);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sendFcmMessage.mockRejectedValueOnce(new Error('FCM send failed: 503'));

    await runActivityPoll(db, env, () => 1_000_000);
    expect(await getRegistrationById(db, 'reg-1')).toMatchObject({
      last_seen_comments_total: 0,
      last_seen_notifications_total: 5,
    });
  });
});
