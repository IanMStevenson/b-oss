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

/** Whether Blipfoto has rejected the read token itself. b-api's `isTokenInvalid` covers 50/51;
 * b-push also treats 52 ("The client is invalid.") as a rejected token. Blipfoto returns 52 for a
 * bearer it doesn't recognise at all, because a bearer can be either a user token or a client id.
 * b-push only ever sends user read tokens, never a client id, so here a 52 can only mean the read
 * token isn't recognised (b-oss#238). b-api itself is left alone: in the app, 52 means a build
 * misconfiguration, not a dead per-account token. */
function isReadTokenRejected(err: unknown): boolean {
  return err instanceof BlipfotoError && (err.isTokenInvalid || err.code === 52);
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
    const settings = await client.getNotificationSettings();
    return settings.push?.configured === 1;
  } catch (err) {
    if (isReadTokenRejected(err)) {
      throw new ReadTokenInvalidError();
    }
    throw err;
  }
}
