// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The owner check every OAuth round for an *existing* account goes through (b-oss#240). A
// sign-in round runs in whatever browser session it's given, and the system browser happily
// approves as whoever is already logged in to Blipfoto there — which isn't necessarily the account
// the app asked for (the #148 device test: a read token registered under `cyclopstest` belonged
// to `cyclops`). So after a round meant for a known account, the token's owner is compared with
// that account and a mismatch is refused: the new token is revoked, nothing is stored, and this
// error says who it was actually for.
//
// Kept in its own module, not accountsFlow.ts, because pushFlow.ts raises it too (b-push's 403
// for a token that belongs to someone else — defence in depth) and the screens import it without
// pulling in, or having to mock, the flows themselves.

export class AccountMismatchError extends Error {
  constructor(
    /** The account the round was for. */
    public readonly expected: string,
    /** Who the token actually belongs to, or null when only the notification service's 403 said
     * it was someone else (it doesn't say who). */
    public readonly actual: string | null,
    /** Whether the round ran in the clean in-app browser (so the wrong account was typed in,
     * rather than reused from the system browser's login). */
    public readonly inApp: boolean = false,
  ) {
    super(
      actual
        ? `That sign-in was for ${actual}, not ${expected}.`
        : `That sign-in was for a different Blipfoto account, not ${expected}.`,
    );
    this.name = 'AccountMismatchError';
  }
}

/** Blipfoto usernames are case-insensitive, and the redirect, `GET oauth/token` and b-push's
 * `user/profile` check aren't guaranteed to agree on case. */
export function sameUsername(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
