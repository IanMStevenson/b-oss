// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// HTTP handlers for the registration contract (notification-service.md "Registration contract").
// Each takes the parsed request pieces it needs (not a raw Request) plus a DbLike, so they're
// unit-testable without going through src/index.ts's router or a real HTTP request at all.

import type { DbLike } from '../db.js';
import {
  insertRegistration,
  getRegistrationById,
  deleteRegistration as deleteRegistrationRow,
  updateReadToken,
  updateDeviceToken,
  updatePollInterval,
  updateCachedPrefs,
} from '../db.js';
import { fetchUnreadTotals, fetchPushConfigured, ReadTokenInvalidError } from '../blipfoto.js';
import {
  generateId,
  generateSecret,
  hashSecret,
  timingSafeEqualHex,
  importEncryptionKey,
  encryptReadToken,
  decryptReadToken,
} from '../crypto.js';
import type {
  Env,
  CreateRegistrationBody,
  CreateRegistrationResult,
  PatchRegistrationBody,
  RegistrationStatusResult,
  Platform,
} from '../types.js';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

function requireBearer(authHeader: string | null): string {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Missing or malformed Authorization header');
  }
  return authHeader.slice('Bearer '.length);
}

/** `POST` auth: the shared, build-time constant every install carries — "a coarse gate, not a
 * credential" (notification-service.md). Compared as plain strings (not hashed) since it isn't
 * itself derived from anything secret-per-row the way a registration's own bearer secret is. */
function requireRegistrationSecret(authHeader: string | null, env: Env): void {
  const presented = requireBearer(authHeader);
  if (presented !== env.REGISTRATION_SECRET) {
    throw new HttpError(401, 'Invalid registration secret');
  }
}

/** `PATCH`/`DELETE`/`refresh-preferences`/`GET` auth: the per-registration bearer secret returned
 * once at creation. Loads the row as a side effect (every caller needs it anyway). A wrong id and
 * a right-id-wrong-secret both collapse to the same 404 rather than a distinguishing 401/404 pair
 * — neither case should tell a caller anything about whether an id merely exists. */
async function authenticate(db: DbLike, id: string, authHeader: string | null) {
  const presented = requireBearer(authHeader);
  const row = await getRegistrationById(db, id);
  if (!row) throw new HttpError(404, 'No such registration');
  const presentedHash = await hashSecret(presented);
  if (!timingSafeEqualHex(presentedHash, row.secret_hash)) {
    throw new HttpError(404, 'No such registration');
  }
  return row;
}

function isPlatform(value: unknown): value is Platform {
  return value === 'android' || value === 'ios';
}

/** `POST /v1/registrations` — also seeds `last_seen_*_total` from a real, immediate
 * `messages/totals/unread` call using the just-provided read token, rather than leaving both at
 * 0. Without this, an account with pre-existing unread items at registration time would see the
 * very first activity-poll tick read as "N new comments/notifications" for items the user
 * already knew about — a false positive the spec doc doesn't discuss but this service can avoid
 * for free, since it already needs a live read token to store. Also seeds `cached_push_prefs`
 * from the same round-trip's readily-available context (one extra call, at registration time
 * only, not on every poll — "Preference freshness" only rules out doing this on *every* poll). */
export async function createRegistration(
  db: DbLike,
  env: Env,
  authHeader: string | null,
  body: Partial<CreateRegistrationBody>,
): Promise<CreateRegistrationResult> {
  requireRegistrationSecret(authHeader, env);

  if (!body.blipfotoUserId || !body.readToken || !body.deviceToken || !isPlatform(body.platform)) {
    throw new HttpError(400, 'blipfotoUserId, readToken, deviceToken and platform are required');
  }

  let seedTotals = { comments: 0, notifications: 0 };
  let pushConfigured = true;
  try {
    [seedTotals, pushConfigured] = await Promise.all([
      fetchUnreadTotals(body.readToken),
      fetchPushConfigured(body.readToken),
    ]);
  } catch (err) {
    if (err instanceof ReadTokenInvalidError) {
      throw new HttpError(400, 'The supplied read token is not valid');
    }
    throw err;
  }

  const id = generateId();
  const secret = generateSecret();
  const secretHash = await hashSecret(secret);
  const key = await importEncryptionKey(env.READ_TOKEN_ENCRYPTION_KEY);
  const { ciphertext, nonce } = await encryptReadToken(body.readToken, key);
  const nowMs = Date.now();

  await insertRegistration(db, {
    id,
    secret_hash: secretHash,
    blipfoto_user_id: body.blipfotoUserId,
    read_token_ciphertext: ciphertext,
    read_token_nonce: nonce,
    device_token: body.deviceToken,
    platform: body.platform,
    poll_interval_minutes: 5,
    last_polled_at: nowMs,
    last_seen_comments_total: seedTotals.comments,
    last_seen_notifications_total: seedTotals.notifications,
    cached_push_prefs: JSON.stringify({ configured: pushConfigured }),
    prefs_fetched_at: nowMs,
    status: 'active',
    created_at: nowMs,
  });

  return { registrationId: id, registrationSecret: secret };
}

export async function patchRegistration(
  db: DbLike,
  env: Env,
  id: string,
  authHeader: string | null,
  body: PatchRegistrationBody,
): Promise<void> {
  await authenticate(db, id, authHeader);

  if (body.readToken !== undefined) {
    const key = await importEncryptionKey(env.READ_TOKEN_ENCRYPTION_KEY);
    const { ciphertext, nonce } = await encryptReadToken(body.readToken, key);
    await updateReadToken(db, id, ciphertext, nonce);
  }
  if (body.deviceToken !== undefined) {
    await updateDeviceToken(db, id, body.deviceToken);
  }
  if (body.pollIntervalMinutes !== undefined) {
    await updatePollInterval(db, id, body.pollIntervalMinutes);
  }
}

/** `POST /v1/registrations/:id/refresh-preferences` — a dedicated ping, distinct from `PATCH`
 * (notification-service.md: "this says 'go re-read Blipfoto now'", not "here is a new stored
 * field value"). Called by `FLW-17` right after a successful Notifications-section save, so the
 * change takes effect immediately instead of waiting for the hourly cron. */
export async function refreshPreferences(
  db: DbLike,
  env: Env,
  id: string,
  authHeader: string | null,
): Promise<void> {
  const row = await authenticate(db, id, authHeader);
  const key = await importEncryptionKey(env.READ_TOKEN_ENCRYPTION_KEY);
  const readToken = await decryptReadToken(
    { ciphertext: row.read_token_ciphertext, nonce: row.read_token_nonce },
    key,
  );
  try {
    const configured = await fetchPushConfigured(readToken);
    await updateCachedPrefs(db, id, JSON.stringify({ configured }), Date.now());
  } catch (err) {
    if (err instanceof ReadTokenInvalidError) {
      // Not this endpoint's job to flip the row's status — same reasoning as
      // prefsRefresh.ts's own note: only the activity poll marks read-token-invalid, so a
      // resend/duplicate reauth-required push (or a missed one, if it went dead here instead)
      // can't happen. Swallow and let the next activity-poll tick find it.
      return;
    }
    throw err;
  }
}

export async function getRegistrationStatus(
  db: DbLike,
  id: string,
  authHeader: string | null,
): Promise<RegistrationStatusResult> {
  const row = await authenticate(db, id, authHeader);
  return { status: row.status, lastPolledAt: row.last_polled_at };
}

/** `DELETE /v1/registrations/:id` — a real row removal, not a soft-disable (notification-
 * service.md, "Security notes": "an account that's removed or turns notifications off should
 * leave no live read token sitting in the service's store"). */
export async function deleteRegistrationHandler(
  db: DbLike,
  id: string,
  authHeader: string | null,
): Promise<void> {
  await authenticate(db, id, authHeader);
  await deleteRegistrationRow(db, id);
}
