// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from './testDb.js';
import {
  createRegistration,
  patchRegistration,
  refreshPreferences,
  getRegistrationStatus,
  deleteRegistrationHandler,
  HttpError,
} from '../routes/registrations.js';
import { getRegistrationById } from '../db.js';
import type { Env } from '../types.js';

function envelope(data: unknown): string {
  return JSON.stringify({ data, error: null });
}

function testKeyBase64(): string {
  const bytes = new Uint8Array(32).fill(3);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function testEnv(): Env {
  return {
    DB: undefined as never,
    READ_TOKEN_ENCRYPTION_KEY: testKeyBase64(),
    REGISTRATION_SECRET: 'shared-build-time-secret',
    FCM_SERVICE_ACCOUNT_JSON: '{}',
  };
}

let db: TestDb;
let env: Env;

beforeEach(() => {
  db = createTestDb();
  env = testEnv();
});

afterEach(() => {
  db.close();
  vi.restoreAllMocks();
});

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function mockUnreadTotalsAndPrefs(comments = 0, notifications = 0, pushConfigured = true): void {
  const spy = vi.spyOn(globalThis, 'fetch');
  spy.mockImplementation((input) => {
    const url = requestUrl(input);
    if (url.includes('messages/totals/unread')) {
      return Promise.resolve(new Response(envelope({ comments, notifications }), { status: 200 }));
    }
    if (url.includes('user/settings/notifications')) {
      return Promise.resolve(
        new Response(envelope({ push: { configured: pushConfigured ? 1 : 0, settings: {} } }), {
          status: 200,
        }),
      );
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe('createRegistration', () => {
  it('rejects a missing/wrong registration secret', async () => {
    mockUnreadTotalsAndPrefs();
    await expect(
      createRegistration(db, env, 'Bearer wrong-secret', {
        blipfotoUserId: 'gbradley',
        readToken: 'rt',
        deviceToken: 'dt',
        platform: 'android',
      }),
    ).rejects.toThrow(HttpError);
  });

  it('rejects an incomplete body', async () => {
    await expect(
      createRegistration(db, env, 'Bearer shared-build-time-secret', {
        blipfotoUserId: 'gbradley',
      }),
    ).rejects.toThrow(HttpError);
  });

  it('creates a row, seeded with the current unread totals and push-configured flag', async () => {
    mockUnreadTotalsAndPrefs(4, 9, true);
    const result = await createRegistration(db, env, 'Bearer shared-build-time-secret', {
      blipfotoUserId: 'gbradley',
      readToken: 'a-real-read-token',
      deviceToken: 'device-1',
      platform: 'android',
    });

    expect(result.registrationId).toBeTruthy();
    expect(result.registrationSecret).toBeTruthy();

    const row = await getRegistrationById(db, result.registrationId);
    expect(row).toMatchObject({
      blipfoto_user_id: 'gbradley',
      device_token: 'device-1',
      platform: 'android',
      poll_interval_minutes: 5,
      last_seen_comments_total: 4,
      last_seen_notifications_total: 9,
      status: 'active',
    });
    expect(row?.cached_push_prefs).toBe('{"configured":true}');
    // The plaintext read token is never stored verbatim.
    expect(row?.read_token_ciphertext).not.toContain('a-real-read-token');
  });

  it('rejects a read token Blipfoto itself reports invalid', async () => {
    // fetchUnreadTotals/fetchPushConfigured run concurrently (Promise.all) — each needs its own
    // Response instance, since a body can only be read once.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: null, error: { code: 51, message: 'bad token' } }), {
          status: 200,
        }),
      ),
    );
    await expect(
      createRegistration(db, env, 'Bearer shared-build-time-secret', {
        blipfotoUserId: 'gbradley',
        readToken: 'dead-token',
        deviceToken: 'device-1',
        platform: 'android',
      }),
    ).rejects.toThrow(HttpError);
  });
});

async function seedRegistration(): Promise<{ id: string; secret: string }> {
  mockUnreadTotalsAndPrefs(0, 0, true);
  const result = await createRegistration(db, env, 'Bearer shared-build-time-secret', {
    blipfotoUserId: 'gbradley',
    readToken: 'a-real-read-token',
    deviceToken: 'device-1',
    platform: 'android',
  });
  vi.restoreAllMocks();
  return { id: result.registrationId, secret: result.registrationSecret };
}

describe('patchRegistration', () => {
  it('rejects a wrong secret with a 404 (not a 401 — no confirmation the id exists)', async () => {
    const { id } = await seedRegistration();
    await expect(
      patchRegistration(db, env, id, 'Bearer wrong-secret', { pollIntervalMinutes: 10 }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('updates only the provided fields, enforcing the poll-interval floor', async () => {
    const { id, secret } = await seedRegistration();
    await patchRegistration(db, env, id, `Bearer ${secret}`, { pollIntervalMinutes: 1 });
    const row = await getRegistrationById(db, id);
    expect(row?.poll_interval_minutes).toBe(5);
    expect(row?.device_token).toBe('device-1'); // untouched
  });

  it('re-encrypts a new read token and resets status to active', async () => {
    const { id, secret } = await seedRegistration();
    // Simulate the row having gone dead first.
    await patchRegistration(db, env, id, `Bearer ${secret}`, { readToken: 'fresh-read-token' });
    const row = await getRegistrationById(db, id);
    expect(row?.status).toBe('active');
    expect(row?.read_token_ciphertext).not.toContain('fresh-read-token');
  });

  it('updates the device token on FCM rotation', async () => {
    const { id, secret } = await seedRegistration();
    await patchRegistration(db, env, id, `Bearer ${secret}`, { deviceToken: 'rotated-device' });
    const row = await getRegistrationById(db, id);
    expect(row?.device_token).toBe('rotated-device');
  });
});

describe('refreshPreferences', () => {
  it('re-fetches and caches the push-configured flag', async () => {
    const { id, secret } = await seedRegistration();
    mockUnreadTotalsAndPrefs(0, 0, false);
    await refreshPreferences(db, env, id, `Bearer ${secret}`);
    const row = await getRegistrationById(db, id);
    expect(row?.cached_push_prefs).toBe('{"configured":false}');
  });

  it('rejects a wrong secret', async () => {
    const { id } = await seedRegistration();
    await expect(refreshPreferences(db, env, id, 'Bearer wrong')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('does not mark the row read-token-invalid on a dead token — the activity poll owns that', async () => {
    const { id, secret } = await seedRegistration();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: null, error: { code: 51, message: 'bad token' } }), {
        status: 200,
      }),
    );
    await refreshPreferences(db, env, id, `Bearer ${secret}`);
    const row = await getRegistrationById(db, id);
    expect(row?.status).toBe('active');
  });
});

describe('getRegistrationStatus', () => {
  it('reports the current status and last-polled time', async () => {
    const { id, secret } = await seedRegistration();
    const status = await getRegistrationStatus(db, id, `Bearer ${secret}`);
    expect(status.status).toBe('active');
    expect(typeof status.lastPolledAt).toBe('number');
  });
});

describe('deleteRegistrationHandler', () => {
  it('removes the row entirely, not a soft-disable', async () => {
    const { id, secret } = await seedRegistration();
    await deleteRegistrationHandler(db, id, `Bearer ${secret}`);
    expect(await getRegistrationById(db, id)).toBeNull();
  });

  it('rejects a wrong secret and leaves the row in place', async () => {
    const { id } = await seedRegistration();
    await expect(deleteRegistrationHandler(db, id, 'Bearer wrong')).rejects.toMatchObject({
      status: 404,
    });
    expect(await getRegistrationById(db, id)).not.toBeNull();
  });
});
