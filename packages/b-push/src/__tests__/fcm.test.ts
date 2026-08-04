// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// sendFcmMessage() makes two real network calls (OAuth2 token exchange, then the FCM send) —
// both go through the global `fetch`, mocked here rather than run for real (this phase's explicit
// scope boundary: no real Cloudflare/FCM traffic). A real RSA keypair is generated once per test
// file so the JWT signing step itself is exercised for real (crypto.subtle.sign against a real
// PKCS8 key), not mocked away — only the two HTTP calls are faked.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { sendFcmMessage } from '../fcm.js';
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
    expect(sentBody.message.notification.body).toBe('2 new comments');
    expect(sentBody.message.data).toEqual({
      kind: 'activity',
      stream: 'comments',
      accountId: 'gbradley',
    });
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
});
