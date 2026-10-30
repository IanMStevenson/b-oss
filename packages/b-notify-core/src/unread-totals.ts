// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The one Blipfoto call a notification poll makes: `messages/totals/unread`, which is the only
// side-effect-free read of the two counts. Counts only, deliberately: nothing that fetches recent
// comments or notifications may be added here or called by a poller, because those endpoints mark
// what they return as read on the server. Uses @b-oss/b-api (fetch/URL only, so it runs on Workers
// and in Electron alike) to keep envelope parsing and error-code semantics in one place.

import { BlipfotoClient, BlipfotoError } from '@b-oss/b-api';

/** Blipfoto has rejected the token itself (codes 50/51, b-api's `isTokenInvalid`): the account
 * must sign in again. Code 52 ("the client is invalid") is deliberately NOT this error: it means
 * something wider than one token has gone wrong, so it is rethrown as the plain BlipfotoError and
 * a poller should treat it as an ordinary, retryable failure. */
export class TokenInvalidError extends Error {
  constructor() {
    super('Blipfoto token is no longer valid');
    this.name = 'TokenInvalidError';
  }
}

export interface UnreadTotals {
  comments: number;
  notifications: number;
}

/** `messages/totals/unread` with both return flags set. Never use
 * `messages/notifications/unread/Total` instead: it reports the notification count under both
 * keys. A missing key counts as 0. */
export interface FetchOptions {
  /** API base URL including the version path; defaults to the real API. A host with its own
   * network stack or a test stub passes its own. */
  baseUrl?: string;
  fetch?: typeof fetch;
}

export async function fetchUnreadTotals(
  token: string,
  options: FetchOptions = {},
): Promise<UnreadTotals> {
  const client = new BlipfotoClient(token, options.baseUrl, options.fetch);
  try {
    const result = await client.getUnreadTotals({
      returnComments: true,
      returnNotifications: true,
    });
    return { comments: result.comments ?? 0, notifications: result.notifications ?? 0 };
  } catch (err) {
    if (err instanceof BlipfotoError && err.isTokenInvalid) throw new TokenInvalidError();
    throw err;
  }
}
