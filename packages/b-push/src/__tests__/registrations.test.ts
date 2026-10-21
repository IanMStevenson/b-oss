// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDb } from './testDb.js';
import {
  createRegistration,
  patchRegistration,
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

/** Answers the only two Blipfoto calls b-push makes: `messages/totals/unread`, and
 * `user/profile` (the token owner, b-oss#240), as `owner`. Anything else, including the
 * `user/settings/notifications` call registration used to make, fails the test: b-push must not
 * read Blipfoto's notification settings any more (b-oss#244). */
function mockBlipfoto(comments = 0, notifications = 0, owner = 'gbradley') {
  const spy = vi.spyOn(globalThis, 'fetch');
  spy.mockImplementation((input) => {
    const url = requestUrl(input);
    if (url.includes('messages/totals/unread')) {
      return Promise.resolve(new Response(envelope({ comments, notifications }), { status: 200 }));
    }
    if (url.includes('user/profile')) {
      const user = { username: owner, avatar_url: '', icons: [] };
      return Promise.resolve(new Response(envelope({ user, visibility: 1 }), { status: 200 }));
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  return spy;
}

describe('createRegistration', () => {
  it('rejects a missing/wrong registration secret', async () => {
    mockBlipfoto();
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

  it('creates a row, seeded with the current unread totals, both streams on by default', async () => {
    mockBlipfoto(4, 9);
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
    expect(row).toMatchObject({ push_comments: 1, push_notifications: 1 });
    // The plaintext read token is never stored verbatim.
    expect(row?.read_token_ciphertext).not.toContain('a-real-read-token');
  });

  it('rejects a read token Blipfoto itself reports invalid', async () => {
    // A fresh Response per call, since a body can only be read once.
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

describe('createRegistration stream toggles (b-oss#244)', () => {
  it('stores pushComments/pushNotifications from the body', async () => {
    mockBlipfoto();
    const result = await createRegistration(db, env, 'Bearer shared-build-time-secret', {
      blipfotoUserId: 'gbradley',
      readToken: 'a-real-read-token',
      deviceToken: 'device-1',
      platform: 'android',
      pushComments: false,
      pushNotifications: true,
    });
    expect(await getRegistrationById(db, result.registrationId)).toMatchObject({
      push_comments: 0,
      push_notifications: 1,
    });
  });

  it('rejects a non-boolean toggle with 400 and stores nothing', async () => {
    mockBlipfoto();
    const attempt = createRegistration(db, env, 'Bearer shared-build-time-secret', {
      blipfotoUserId: 'gbradley',
      readToken: 'a-real-read-token',
      deviceToken: 'device-1',
      platform: 'android',
      pushComments: 'false' as unknown as boolean,
    });
    await expect(attempt).rejects.toMatchObject({ status: 400 });
    const { results } = await db.prepare('SELECT id FROM registrations').all();
    expect(results).toHaveLength(0);
  });
});

describe('token owner check (b-oss#240)', () => {
  const body = {
    blipfotoUserId: 'cyclopstest',
    readToken: 'a-real-read-token',
    deviceToken: 'device-1',
    platform: 'android' as const,
  };

  it('creates the registration when the token belongs to blipfotoUserId, ignoring case', async () => {
    const spy = mockBlipfoto(0, 0, 'CyclopsTest');
    const result = await createRegistration(db, env, 'Bearer shared-build-time-secret', body);
    expect(await getRegistrationById(db, result.registrationId)).not.toBeNull();
    // Asked for the token's own profile: no username, no extras.
    const profileUrl = spy.mock.calls
      .map(([input]) => new URL(requestUrl(input)))
      .find((u) => u.pathname.includes('user/profile'));
    expect(profileUrl?.searchParams.toString()).toBe('');
  });

  it('rejects a token belonging to a different account with 403 and stores nothing', async () => {
    mockBlipfoto(0, 0, 'cyclops');
    const attempt = createRegistration(db, env, 'Bearer shared-build-time-secret', body);
    await expect(attempt).rejects.toMatchObject({
      status: 403,
      message: 'The read token belongs to a different Blipfoto account',
    });
    const { results } = await db.prepare('SELECT id FROM registrations').all();
    expect(results).toHaveLength(0);
  });

  it('PATCH: accepts a re-authorised token for the same account', async () => {
    const { id, secret } = await seedRegistration();
    mockBlipfoto(0, 0, 'GBradley');
    const before = await getRegistrationById(db, id);
    await patchRegistration(db, env, id, `Bearer ${secret}`, { readToken: 'fresh-read-token' });
    const after = await getRegistrationById(db, id);
    expect(after?.read_token_ciphertext).not.toBe(before?.read_token_ciphertext);
  });

  it('PATCH: rejects a token for a different account with 403 and leaves the row unchanged', async () => {
    const { id, secret } = await seedRegistration();
    const before = await getRegistrationById(db, id);
    mockBlipfoto(0, 0, 'someone-else');
    await expect(
      patchRegistration(db, env, id, `Bearer ${secret}`, {
        readToken: 'someone-elses-token',
        deviceToken: 'rotated-device',
        pushComments: false,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(await getRegistrationById(db, id)).toEqual(before);
  });

  it('PATCH: rejects a token Blipfoto reports invalid with 400 and leaves the row unchanged', async () => {
    const { id, secret } = await seedRegistration();
    const before = await getRegistrationById(db, id);
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: null, error: { code: 51, message: 'bad token' } }), {
          status: 200,
        }),
      ),
    );
    await expect(
      patchRegistration(db, env, id, `Bearer ${secret}`, { readToken: 'dead-token' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await getRegistrationById(db, id)).toEqual(before);
  });

  it('PATCH without a readToken makes no Blipfoto call', async () => {
    const { id, secret } = await seedRegistration();
    const spy = vi.spyOn(globalThis, 'fetch');
    await patchRegistration(db, env, id, `Bearer ${secret}`, { deviceToken: 'rotated-device' });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('createRegistration with a junk read token (b-oss#238)', () => {
  it('rejects with 400, not an internal error, and stores nothing', async () => {
    // The live API's answer to an unrecognised bearer: HTTP 200 with code 52.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ data: null, error: { code: 52, message: 'The client is invalid.' } }),
          { status: 200 },
        ),
      ),
    );
    const attempt = createRegistration(db, env, 'Bearer shared-build-time-secret', {
      blipfotoUserId: 'gbradley',
      readToken: 'junk-not-a-token',
      deviceToken: 'device-1',
      platform: 'android',
    });
    await expect(attempt).rejects.toMatchObject({ status: 400 });
    const { results } = await db.prepare('SELECT id FROM registrations').all();
    expect(results).toHaveLength(0);
  });
});

async function seedRegistration(): Promise<{ id: string; secret: string }> {
  mockBlipfoto(0, 0);
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

  it.each([['10'], [Number.NaN], [Number.POSITIVE_INFINITY], [null], [{}]])(
    'rejects pollIntervalMinutes %j with a 400 and leaves the row unchanged',
    async (value) => {
      const { id, secret } = await seedRegistration();
      await expect(
        patchRegistration(db, env, id, `Bearer ${secret}`, {
          pollIntervalMinutes: value as number,
          deviceToken: 'device-2',
        }),
      ).rejects.toMatchObject({ status: 400 });
      const row = await getRegistrationById(db, id);
      expect(row?.poll_interval_minutes).toBe(5);
      expect(row?.device_token).toBe('device-1');
    },
  );

  it('re-encrypts a new read token and resets status to active', async () => {
    const { id, secret } = await seedRegistration();
    // Simulate the row having gone dead first.
    mockBlipfoto();
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

describe('patchRegistration stream toggles (b-oss#244)', () => {
  it('updates only the toggle supplied', async () => {
    const { id, secret } = await seedRegistration();
    await patchRegistration(db, env, id, `Bearer ${secret}`, { pushNotifications: false });
    expect(await getRegistrationById(db, id)).toMatchObject({
      push_comments: 1,
      push_notifications: 0,
    });
    await patchRegistration(db, env, id, `Bearer ${secret}`, { pushComments: false });
    expect(await getRegistrationById(db, id)).toMatchObject({
      push_comments: 0,
      push_notifications: 0,
    });
  });

  it('rejects a non-boolean toggle with 400 and changes nothing, not even other fields', async () => {
    const { id, secret } = await seedRegistration();
    await expect(
      patchRegistration(db, env, id, `Bearer ${secret}`, {
        deviceToken: 'rotated-device',
        pushComments: 0 as unknown as boolean,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await getRegistrationById(db, id)).toMatchObject({
      device_token: 'device-1',
      push_comments: 1,
    });
  });
});

describe('getRegistrationStatus', () => {
  it('reports the current status and last-polled time', async () => {
    const { id, secret } = await seedRegistration();
    const status = await getRegistrationStatus(db, id, `Bearer ${secret}`);
    expect(status.status).toBe('active');
    expect(typeof status.lastPolledAt).toBe('number');
  });

  it('reports the stream toggles as booleans (b-oss#244)', async () => {
    const { id, secret } = await seedRegistration();
    await patchRegistration(db, env, id, `Bearer ${secret}`, { pushComments: false });
    const status = await getRegistrationStatus(db, id, `Bearer ${secret}`);
    expect(status).toMatchObject({ pushComments: false, pushNotifications: true });
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
