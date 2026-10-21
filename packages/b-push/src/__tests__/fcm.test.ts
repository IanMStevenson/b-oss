// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// sendFcmMessage() makes two real network calls (OAuth2 token exchange, then the FCM send) —
// both go through the global `fetch`, mocked here rather than run for real (this phase's explicit
// scope boundary: no real Cloudflare/FCM traffic). A real RSA keypair is generated once per test
// file so the JWT signing step itself is exercised for real (crypto.subtle.sign against a real
// PKCS8 key), not mocked away — only the two HTTP calls are faked.

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { DeviceUnregisteredError, resetFcmTokenCache, sendFcmMessage } from '../fcm.js';
import { RequestBudget } from '../budget.js';
import type { Env } from '../types.js';

let privateKeyPem: string;

beforeAll(() => {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  privateKeyPem = privateKey;
});

function testEnv(): Env {
  return {
    DB: undefined as never,
    READ_TOKEN_ENCRYPTION_KEY: '',
    REGISTRATION_SECRET: '',
    FCM_SERVICE_ACCOUNT_JSON: JSON.stringify({
      client_email: 'b-push@test-project.iam.gserviceaccount.com',
      private_key: privateKeyPem,
      project_id: 'test-project',
    }),
  };
}

beforeEach(() => {
  resetFcmTokenCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockFetchSequence(...responses: Response[]): void {
  const spy = vi.spyOn(globalThis, 'fetch');
  for (const response of responses) spy.mockImplementationOnce(() => Promise.resolve(response));
}

describe('sendFcmMessage', () => {
  it('exchanges a signed JWT for an access token, then POSTs the FCM send with it', async () => {
    mockFetchSequence(
      new Response(JSON.stringify({ access_token: 'fake-access-token' }), { status: 200 }),
      new Response(JSON.stringify({ name: 'projects/test-project/messages/1' }), { status: 200 }),
    );
    const fetchSpy = vi.mocked(globalThis.fetch);

    await sendFcmMessage(testEnv(), 'device-token-1', {
      kind: 'activity',
      stream: 'comments',
      accountId: 'gbradley',
      count: 2,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const [tokenUrl, tokenInit] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token');
    const tokenBody = new URLSearchParams(tokenInit.body as string);
    expect(tokenBody.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const jwt = tokenBody.get('assertion')!;
    expect(jwt.split('.')).toHaveLength(3);

    const [sendUrl, sendInit] = fetchSpy.mock.calls[1] as [string, RequestInit];
    expect(sendUrl).toBe('https://fcm.googleapis.com/v1/projects/test-project/messages:send');
    expect((sendInit.headers as Record<string, string>).Authorization).toBe(
      'Bearer fake-access-token',
    );
    const sentBody = JSON.parse(sendInit.body as string) as {
      message: {
        token: string;
        notification: { title: string; body: string };
        data: Record<string, string>;
      };
    };
    expect(sentBody.message.token).toBe('device-token-1');
    expect(sentBody.message.notification.title).toBe('b-mobile');
    expect(sentBody.message.notification.body).toBe('2 new comments');
    expect(sentBody.message.data).toEqual({
      kind: 'activity',
      stream: 'comments',
      accountId: 'gbradley',
    });
  });

  it('routes activity pushes to the activity channel and reauth-required to system_alerts', async () => {
    mockFetchSequence(
      new Response(JSON.stringify({ access_token: 't' }), { status: 200 }),
      new Response(JSON.stringify({}), { status: 200 }),
      new Response(JSON.stringify({}), { status: 200 }),
    );
    const fetchSpy = vi.mocked(globalThis.fetch);

    await sendFcmMessage(testEnv(), 'device-token-1', {
      kind: 'activity',
      stream: 'comments',
      accountId: 'gbradley',
      count: 2,
    });
    await sendFcmMessage(testEnv(), 'device-token-1', {
      kind: 'reauth-required',
      accountId: 'gbradley',
    });

    type SentBody = { message: { android: { notification: { channel_id: string } } } };
    const activityBody = JSON.parse(fetchSpy.mock.calls[1][1]!.body as string) as SentBody;
    const reauthBody = JSON.parse(fetchSpy.mock.calls[2][1]!.body as string) as SentBody;
    expect(activityBody.message.android.notification.channel_id).toBe('activity');
    expect(reauthBody.message.android.notification.channel_id).toBe('system_alerts');
  });

  it('singularizes the count-1 case', async () => {
    mockFetchSequence(
      new Response(JSON.stringify({ access_token: 't' }), { status: 200 }),
      new Response(JSON.stringify({}), { status: 200 }),
    );
    const fetchSpy = vi.mocked(globalThis.fetch);
    await sendFcmMessage(testEnv(), 'device-token-1', {
      kind: 'activity',
      stream: 'notifications',
      accountId: 'gbradley',
      count: 1,
    });
    const sendInit = fetchSpy.mock.calls[1][1] as RequestInit;
    const body = JSON.parse(sendInit.body as string) as {
      message: { notification: { body: string } };
    };
    expect(body.message.notification.body).toBe('1 new notification');
  });

  it('builds the reauth-required payload with no count/stream', async () => {
    mockFetchSequence(
      new Response(JSON.stringify({ access_token: 't' }), { status: 200 }),
      new Response(JSON.stringify({}), { status: 200 }),
    );
    const fetchSpy = vi.mocked(globalThis.fetch);
    await sendFcmMessage(testEnv(), 'device-token-1', {
      kind: 'reauth-required',
      accountId: 'gbradley',
    });
    const sendInit = fetchSpy.mock.calls[1][1] as RequestInit;
    const body = JSON.parse(sendInit.body as string) as {
      message: { data: Record<string, string> };
    };
    expect(body.message.data).toEqual({ kind: 'reauth-required', accountId: 'gbradley' });
  });

  it('throws when the token exchange fails', async () => {
    mockFetchSequence(new Response('nope', { status: 401 }));
    await expect(
      sendFcmMessage(testEnv(), 'device-token-1', {
        kind: 'reauth-required',
        accountId: 'gbradley',
      }),
    ).rejects.toThrow(/FCM OAuth2 token exchange failed/);
  });

  it('throws when the FCM send itself fails', async () => {
    mockFetchSequence(
      new Response(JSON.stringify({ access_token: 't' }), { status: 200 }),
      new Response('bad token', { status: 404 }),
    );
    await expect(
      sendFcmMessage(testEnv(), 'device-token-1', {
        kind: 'reauth-required',
        accountId: 'gbradley',
      }),
    ).rejects.toThrow(/FCM send failed/);
  });

  // FCM v1's error body for a token that no longer exists (uninstalled / data cleared).
  function fcmError(httpStatus: number, status: string, errorCode: string): Response {
    return new Response(
      JSON.stringify({
        error: {
          code: httpStatus,
          message: 'Requested entity was not found.',
          status,
          details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }],
        },
      }),
      { status: httpStatus },
    );
  }
  const activity = { kind: 'activity', stream: 'comments', accountId: 'a', count: 1 } as const;

  it('throws DeviceUnregisteredError for 404 UNREGISTERED (b-oss#265)', async () => {
    mockFetchSequence(
      new Response(JSON.stringify({ access_token: 't' }), { status: 200 }),
      fcmError(404, 'NOT_FOUND', 'UNREGISTERED'),
    );
    await expect(sendFcmMessage(testEnv(), 'gone', activity)).rejects.toBeInstanceOf(
      DeviceUnregisteredError,
    );
  });

  it('does not treat INVALID_ARGUMENT as a gone device: it may be our payload (b-oss#265)', async () => {
    mockFetchSequence(
      new Response(JSON.stringify({ access_token: 't' }), { status: 200 }),
      fcmError(400, 'INVALID_ARGUMENT', 'INVALID_ARGUMENT'),
    );
    const err: unknown = await sendFcmMessage(testEnv(), 'x', activity).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(DeviceUnregisteredError);
    expect(String(err)).toMatch(/FCM send failed: 400/);
  });

  describe('access token cache', () => {
    const tokenResponse = (t: string) =>
      new Response(JSON.stringify({ access_token: t }), { status: 200 });
    const sendOk = () => new Response('{}', { status: 200 });

    it('exchanges once and reuses the token for later sends', async () => {
      mockFetchSequence(tokenResponse('t1'), sendOk(), sendOk(), sendOk());
      const fetchSpy = vi.mocked(globalThis.fetch);
      for (let i = 0; i < 3; i++) await sendFcmMessage(testEnv(), `d${i}`, activity);

      expect(fetchSpy).toHaveBeenCalledTimes(4);
      const urls = fetchSpy.mock.calls.map((c) => c[0] as string);
      expect(urls.filter((u) => u.includes('oauth2.googleapis.com'))).toHaveLength(1);
      const sendInit = fetchSpy.mock.calls[3][1] as RequestInit;
      expect((sendInit.headers as Record<string, string>).Authorization).toBe('Bearer t1');
    });

    it('exchanges again once the cached token is due to expire', async () => {
      mockFetchSequence(tokenResponse('t1'), sendOk(), tokenResponse('t2'), sendOk());
      const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
      await sendFcmMessage(testEnv(), 'd', activity);
      now.mockReturnValue(1_000_000 + 51 * 60_000);
      await sendFcmMessage(testEnv(), 'd', activity);

      const fetchSpy = vi.mocked(globalThis.fetch);
      expect(fetchSpy).toHaveBeenCalledTimes(4);
      const sendInit = fetchSpy.mock.calls[3][1] as RequestInit;
      expect((sendInit.headers as Record<string, string>).Authorization).toBe('Bearer t2');
    });

    it('drops the cached token when FCM refuses it, so the next send exchanges afresh', async () => {
      mockFetchSequence(
        tokenResponse('t1'),
        new Response('unauthenticated', { status: 401 }),
        tokenResponse('t2'),
        sendOk(),
      );
      await expect(sendFcmMessage(testEnv(), 'd', activity)).rejects.toThrow(/401/);
      await sendFcmMessage(testEnv(), 'd', activity);
      expect(vi.mocked(globalThis.fetch)).toHaveBeenCalledTimes(4);
    });

    it('spends budget only for requests actually made', async () => {
      mockFetchSequence(tokenResponse('t1'), sendOk(), sendOk());
      const budget = new RequestBudget(10);
      await sendFcmMessage(testEnv(), 'd', activity, budget);
      expect(budget.remaining).toBe(8); // exchange + send
      await sendFcmMessage(testEnv(), 'd', activity, budget);
      expect(budget.remaining).toBe(7); // send only
    });
  });
});
