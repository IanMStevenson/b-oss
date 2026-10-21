// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// FCM HTTP v1, signed with the Worker's native Web Crypto API — no external SDK, per
// ARCHITECTURE.md's architecture table (a service-account OAuth2 JWT signed with the Worker's
// Web Crypto API). One network call per send (POST the message), plus an exchange of a signed JWT for a
// short-lived OAuth2 access token when no unexpired one is cached.
//
// Always an ordinary FCM *notification* message (never data-only) — app-architecture.md §11:
// "No data-only delivery... Android defers data-only messages in Doze and drops them entirely for
// a force-stopped app." The same payload is duplicated into `data` so a foreground app doesn't
// have to re-derive it from the display text (platform/push.ts on the app side reads `data`).

import { toBase64Url, fromBase64 } from './crypto.js';
import type { RequestBudget } from './budget.js';
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
  expires_in?: number;
}

/** Google's access tokens last an hour; reuse one for slightly less. A fresh exchange costs a
 * signed JWT (the most CPU-hungry thing the Worker does) and an outbound request, so a run that
 * sends several pushes, or an isolate that serves several runs, pays for it once. Module state is
 * safe here: an isolate that is thrown away just starts with an empty cache. */
const TOKEN_REUSE_MS = 50 * 60_000;

let cachedToken: { clientEmail: string; accessToken: string; expiresAt: number } | null = null;

/** Tests only: forget any cached access token. */
export function resetFcmTokenCache(): void {
  cachedToken = null;
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

/** A usable access token, from the cache if there is one. Only a real exchange spends budget. */
async function getAccessToken(
  account: ServiceAccount,
  budget: RequestBudget | undefined,
): Promise<string> {
  const now = Date.now();
  if (
    cachedToken &&
    cachedToken.clientEmail === account.client_email &&
    now < cachedToken.expiresAt
  ) {
    return cachedToken.accessToken;
  }
  budget?.spend(1);
  const accessToken = await exchangeForAccessToken(await signJwt(account));
  cachedToken = {
    clientEmail: account.client_email,
    accessToken,
    expiresAt: now + TOKEN_REUSE_MS,
  };
  return accessToken;
}

/** The two shapes this service ever pushes — a bare count delta, or the reauth-required system
 * alert (ARCHITECTURE.md "What the push can and cannot say" / "System alert:
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
    // The app's name, not Blipfoto's: these come from b-mobile, not from Blipfoto's own app.
    title: 'b-mobile',
    body: `${payload.count} new ${payload.count === 1 ? noun : `${noun}s`}`,
  };
}

function dataFor(payload: FcmPayload): Record<string, string> {
  if (payload.kind === 'reauth-required') {
    return { kind: 'reauth-required', accountId: payload.accountId };
  }
  return { kind: 'activity', stream: payload.stream, accountId: payload.accountId };
}

// Must match the channel ids b-mobile's android/ project creates at launch
// (app-architecture.md §17's "notification channel per category"). 'reauth-required' is the one
// payload kind that needs a user's attention outside the normal activity flow, so it gets the
// higher-importance system_alerts channel; everything else is routine activity.
function channelIdFor(payload: FcmPayload): string {
  return payload.kind === 'reauth-required' ? 'system_alerts' : 'activity';
}

export async function sendFcmMessage(
  env: Env,
  deviceToken: string,
  payload: FcmPayload,
  budget?: RequestBudget,
): Promise<void> {
  const account = parseServiceAccount(env.FCM_SERVICE_ACCOUNT_JSON);
  const accessToken = await getAccessToken(account, budget);
  const { title, body } = notificationFor(payload);
  budget?.spend(1);

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
          android: { notification: { channel_id: channelIdFor(payload) } },
        },
      }),
    },
  );
  if (!response.ok) {
    const text = await response.text();
    // The cached token was refused (revoked early, or the key was rotated): drop it so the next
    // send exchanges a fresh one rather than failing until it would have expired.
    if (response.status === 401) cachedToken = null;
    if (response.status === 404 && fcmErrorCode(text) === 'UNREGISTERED') {
      throw new DeviceUnregisteredError();
    }
    throw new Error(`FCM send failed: ${response.status} ${text}`);
  }
}

/** FCM's answer for a device token that no longer exists: the app was uninstalled, its data
 * cleared, or the phone replaced. The app can't deregister in those cases (it has lost its
 * per-registration secret), so the poll deletes the row itself (b-oss#265). Deliberately only
 * `UNREGISTERED`: a 400 `INVALID_ARGUMENT` is also what a malformed *payload* gets, so treating it
 * as "token gone" would let a bug in our own message delete every registration. */
export class DeviceUnregisteredError extends Error {
  constructor() {
    super('FCM reports the device token as unregistered');
    this.name = 'DeviceUnregisteredError';
  }
}

/** The `errorCode` FCM v1 puts in its error details, e.g. `UNREGISTERED`. */
function fcmErrorCode(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as {
      error?: { details?: { '@type'?: string; errorCode?: string }[] };
    };
    const detail = parsed.error?.details?.find((d) => d['@type']?.endsWith('fcm.v1.FcmError'));
    return detail?.errorCode ?? null;
  } catch {
    return null;
  }
}
