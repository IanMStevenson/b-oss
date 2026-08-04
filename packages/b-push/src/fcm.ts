// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// FCM HTTP v1, signed with the Worker's native Web Crypto API — no external SDK, per
// notification-service.md's architecture table ("requires a service-account and OAuth2 JWT
// signed via the Worker's native Web Crypto API — no external SDK needed"). Two network calls per
// send: exchange a signed JWT for a short-lived OAuth2 access token, then POST the message.
//
// Always an ordinary FCM *notification* message (never data-only) — app-architecture.md §11:
// "No data-only delivery... Android defers data-only messages in Doze and drops them entirely for
// a force-stopped app." The same payload is duplicated into `data` so a foreground app doesn't
// have to re-derive it from the display text (platform/push.ts on the app side reads `data`).

import { toBase64Url, fromBase64 } from './crypto.js';
import type { Env } from './types.js';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

function parseServiceAccount(json: string): ServiceAccount {
  const parsed = JSON.parse(json) as Partial<ServiceAccount>;
  if (!parsed.client_email || !parsed.private_key || !parsed.project_id) {
    throw new Error('FCM_SERVICE_ACCOUNT_JSON is missing client_email/private_key/project_id');
  }
  return parsed as ServiceAccount;
}

function pemToDer(pem: string): Uint8Array {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  return fromBase64(base64);
}

function importSigningKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    pemToDer(pem),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function signJwt(account: ServiceAccount): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSec,
    exp: nowSec + 3600,
  };
  const encoder = new TextEncoder();
  const signingInput = `${toBase64Url(encoder.encode(JSON.stringify(header)))}.${toBase64Url(
    encoder.encode(JSON.stringify(claims)),
  )}`;
  const key = await importSigningKey(account.private_key);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(signingInput),
  );
  return `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;
}

interface AccessTokenResponse {
  access_token: string;
}

async function exchangeForAccessToken(jwt: string): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!response.ok) {
    throw new Error(
      `FCM OAuth2 token exchange failed: ${response.status} ${await response.text()}`,
    );
  }
  const body = await response.json<AccessTokenResponse>();
  return body.access_token;
}

/** The two shapes this service ever pushes — a bare count delta, or the reauth-required system
 * alert (notification-service.md "What the push can and cannot say" / "System alert:
 * reauth-required"). No type/target/actor in either case. */
export type FcmPayload =
  | { kind: 'activity'; stream: 'comments' | 'notifications'; accountId: string; count: number }
  | { kind: 'reauth-required'; accountId: string };

function notificationFor(payload: FcmPayload): { title: string; body: string } {
  if (payload.kind === 'reauth-required') {
    return {
      title: 'Notifications need re-authorization',
      body: 'Sign in again to keep receiving notifications for this account.',
    };
  }
  const noun = payload.stream === 'comments' ? 'comment' : 'notification';
  return {
    title: 'Blipfoto',
    body: `${payload.count} new ${payload.count === 1 ? noun : `${noun}s`}`,
  };
}

function dataFor(payload: FcmPayload): Record<string, string> {
  if (payload.kind === 'reauth-required') {
    return { kind: 'reauth-required', accountId: payload.accountId };
  }
  return { kind: 'activity', stream: payload.stream, accountId: payload.accountId };
}

export async function sendFcmMessage(
  env: Env,
  deviceToken: string,
  payload: FcmPayload,
): Promise<void> {
  const account = parseServiceAccount(env.FCM_SERVICE_ACCOUNT_JSON);
  const jwt = await signJwt(account);
  const accessToken = await exchangeForAccessToken(jwt);
  const { title, body } = notificationFor(payload);

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title, body },
          data: dataFor(payload),
        },
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`FCM send failed: ${response.status} ${await response.text()}`);
  }
}
