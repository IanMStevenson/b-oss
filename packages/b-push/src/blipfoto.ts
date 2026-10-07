// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The only two Blipfoto calls this service is ever allowed to make (notification-service.md
// "The service must never mark anything read" / "Polling design"). Reuses @b-oss/b-api rather
// than hand-rolling a second HTTP client: b-api has zero Node/Electron/browser-specific
// dependencies (fetch/URL/URLSearchParams only, all Worker globals), so it's safe here exactly as
// it is in b-mobile, and reusing it keeps the envelope-parsing and error-code semantics
// (BlipfotoError.isTokenInvalid) identical between the app and the service rather than risking
// two implementations drifting apart.
//
// Deliberately absent from this file, on purpose, forever: `getRecentComments`,
// `getRecentNotifications`, `markNotificationsRead`, and `getEntry` with comments included — every
// one of them mutates the user's read state server-side. Reaching for any of them here would be
// the exact bug this whole design exists to prevent.

import { BlipfotoClient, BlipfotoError } from '@b-oss/b-api';

export class ReadTokenInvalidError extends Error {
  constructor() {
    super('Blipfoto read token is no longer valid');
    this.name = 'ReadTokenInvalidError';
  }
}

/** Whether Blipfoto has rejected the read token itself: 50/51, b-api's `isTokenInvalid`. The
 * Blipfoto source (checked 2026-10-06, b-oss#148) confirms a revoked or deleted user token comes
 * back as **51**, so this is the only signal that a *stored* token has died and the user needs to
 * re-authorise. Only this throws ReadTokenInvalidError, which is what makes the activity poll
 * mark a row `read-token-invalid` and send the reauth-required push. */
function isReadTokenRejected(err: unknown): boolean {
  return err instanceof BlipfotoError && err.isTokenInvalid;
}

/** Blipfoto code 52, "The client is invalid.": the bearer isn't recognised as a user token at
 * all, so Blipfoto falls back to reading it as a client id and rejects that. Per the Blipfoto
 * source this is *not* what a revoked user token returns (that's 51, above). So its meaning
 * depends on where it turns up (b-oss#238):
 *   - At registration, on a token the app has only just sent, it means the token is junk: invalid
 *     input, so `createRegistration` answers 400.
 *   - On a token already stored and previously accepted, it would mean something wider has gone
 *     wrong (e.g. the app's client being rejected), which would hit every registration at once.
 *     Marking rows dead and pushing "sign in again" to every user would be the wrong response to
 *     that, so the poll treats it as an ordinary, logged, counted error and leaves the row active.
 * The functions below therefore rethrow a 52 as the plain BlipfotoError, never as
 * ReadTokenInvalidError, and only the registration route checks for it. */
export function isBearerUnrecognised(err: unknown): boolean {
  return err instanceof BlipfotoError && err.code === 52;
}

export interface UnreadTotals {
  comments: number;
  notifications: number;
}

/** The one call the 1-minute activity poll makes per due registration — side-effect-free, per
 * the doc: "Only `messages/totals/unread` is side-effect-free." Never call
 * `messages/notifications/unread/Total` instead — it reports the notification count under both
 * keys (notification-service.md, "Polling design"). */
export async function fetchUnreadTotals(readToken: string): Promise<UnreadTotals> {
  const client = new BlipfotoClient(readToken);
  try {
    const result = await client.getUnreadTotals({
      returnComments: true,
      returnNotifications: true,
    });
    return { comments: result.comments ?? 0, notifications: result.notifications ?? 0 };
  } catch (err) {
    if (isReadTokenRejected(err)) {
      throw new ReadTokenInvalidError();
    }
    throw err;
  }
}

/** The hourly preference-refresh tick's one call (notification-service.md "Preference
 * freshness") — `user/settings/notifications` is a plain read with no read-state side effect at
 * all (it's account settings, not the messages stream).
 *
 * Only the `push` channel's `configured` flag is kept, deliberately — not the full per-event
 * settings record. `b-api`'s `NotificationChannel.settings` is a server-defined
 * `Record<string, 0|1>` with no fixed key list (see packages/b-mobile/AGENT_LOG.md's Phase 8
 * entry), and this service's own push is a bare count delta ("2 new comments") with no event
 * type attached to it (notification-service.md, "What the push can and cannot say") — there is
 * no reliable way to map an aggregated stream total back onto one specific per-event key, and the
 * "notifications" stream in particular aggregates several different event types into one count.
 * Attempting per-event filtering here would be precision the signal can't actually support.
 * Gating on the channel's on/off switch is what the available information can honestly do. */
export async function fetchPushConfigured(readToken: string): Promise<boolean> {
  const client = new BlipfotoClient(readToken);
  try {
    // returnPush is required: without return_push=1 Blipfoto omits the push object entirely,
    // which read as "not configured" for every user and suppressed every push (b-oss#242).
    const settings = await client.getNotificationSettings({ returnPush: true });
    return settings.push?.configured === 1;
  } catch (err) {
    if (isReadTokenRejected(err)) {
      throw new ReadTokenInvalidError();
    }
    throw err;
  }
}
