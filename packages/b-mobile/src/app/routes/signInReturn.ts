// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Gated sign-in's return target (b-oss#397): a signed-out user who taps Star/Favourite/Comment/
// Follow, or lands on a write-gated or account-gated route, is sent to `/sign-in?return=<path>`
// and comes back to that path once signed in. The target arrives through the URL, so it is
// validated before use: only an in-app path (single leading `/`) is accepted, never another
// origin, a protocol-relative `//host` or the sign-in screen itself.

export const RETURN_PARAM = 'return';

/** The sign-in route that returns to `returnTo` (a path plus optional query) afterwards. */
export function signInPathFor(returnTo: string): string {
  return `/sign-in?${new URLSearchParams({ [RETURN_PARAM]: returnTo }).toString()}`;
}

/** The validated return target, or `undefined` if `raw` is missing or not an in-app route. */
export function parseReturnTo(raw: string | null): string | undefined {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return undefined;
  if (raw.includes('\\') || /[\u0000-\u001f]/.test(raw)) return undefined;
  const pathname = raw.split(/[?#]/)[0] ?? '';
  if (pathname === '/sign-in' || pathname.startsWith('/sign-in/')) return undefined;
  return raw;
}
