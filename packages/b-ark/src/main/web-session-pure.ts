// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Pure (no `electron` import) helpers for the blipfoto.com website session:
// cookie (de)serialisation, sign-in detection, and scrape-response
// classification. Split out from web-session.ts so it can be unit-tested
// without an Electron runtime — same pattern as migrate-store-pure.ts.

/** Where the interactive sign-in window is pointed. */
export const BLIPFOTO_LOGIN_URL = 'https://www.blipfoto.com/account/signin';

/** Cookie domain Blipfoto scopes its session to (leading dot in Set-Cookie). */
export const BLIPFOTO_COOKIE_DOMAIN = 'blipfoto.com';

/** Origin used to reconstruct a `url` for `session.cookies.set`. */
export const BLIPFOTO_ORIGIN = 'https://www.blipfoto.com';

/**
 * Names of the cookie(s) that indicate an authenticated session. Confirmed live
 * (2026-09): Blipfoto is a plain Apache/PHP stack (no Cloudflare) that sets
 * `BLIPFOTO_SESSION` on `.blipfoto.com`. The signed-out site sets the same
 * cookie name for an anonymous session, so presence alone is not enough — see
 * `isSignedInFromCookies` / `classifyScrapeResponse`, which also check the
 * response for the sign-in form.
 */
export const BLIPFOTO_SESSION_COOKIE_NAMES = ['BLIPFOTO_SESSION'];

/** URL path prefixes that mean "you are not (or no longer) signed in". */
const LOGIN_PATH_PREFIXES = ['/account/signin', '/account/login', '/login'];

/** Serialisable cookie shape — a subset of Electron's `Cookie` / `CookiesSetDetails`. */
export interface WebCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  /** Unix seconds. Omitted for a browser-session (non-persistent) cookie. */
  expirationDate?: number;
  sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict';
}

export function isLoginUrl(url: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  return LOGIN_PATH_PREFIXES.some((p) => path === p || path.startsWith(p + '/') || path === p + '/');
}

/**
 * True when an HTML body is Blipfoto's sign-in page rather than real content.
 * Keyed on the sign-in form's `email` + `password` inputs, which never appear
 * on a rendered entry page.
 */
export function looksLikeLoginPage(html: string): boolean {
  return /name=["']email["']/.test(html) && /name=["']password["']/.test(html);
}

/** True when the cookie jar carries a non-expired Blipfoto session cookie. */
export function isSignedInFromCookies(cookies: WebCookie[], nowMs: number = Date.now()): boolean {
  return cookies.some(
    (c) =>
      BLIPFOTO_SESSION_COOKIE_NAMES.includes(c.name) &&
      c.value.length > 0 &&
      (c.expirationDate === undefined || c.expirationDate * 1000 > nowMs),
  );
}

/**
 * Decide whether a scrape fetch came back as real content or as a
 * signed-out/blocked response. `expired` covers: an auth-ish status, a redirect
 * that landed on the sign-in page, or a 200 whose body *is* the sign-in page.
 */
export function classifyScrapeResponse(input: {
  status: number;
  finalUrl: string;
  body: string;
}): 'ok' | 'expired' {
  if (input.status === 401 || input.status === 403) return 'expired';
  if (isLoginUrl(input.finalUrl)) return 'expired';
  if (looksLikeLoginPage(input.body)) return 'expired';
  return 'ok';
}

export function serializeCookies(cookies: WebCookie[]): string {
  return JSON.stringify(cookies);
}

export function deserializeCookies(serialised: string): WebCookie[] {
  const parsed = JSON.parse(serialised) as unknown;
  if (!Array.isArray(parsed)) throw new Error('web session blob is not a cookie array');
  return parsed.map((raw): WebCookie => {
    const c = raw as Record<string, unknown>;
    if (typeof c['name'] !== 'string' || typeof c['value'] !== 'string') {
      throw new Error('web session blob has a malformed cookie');
    }
    return {
      name: c['name'],
      value: c['value'],
      domain: typeof c['domain'] === 'string' ? c['domain'] : BLIPFOTO_COOKIE_DOMAIN,
      path: typeof c['path'] === 'string' ? c['path'] : '/',
      secure: c['secure'] === true,
      httpOnly: c['httpOnly'] === true,
      expirationDate:
        typeof c['expirationDate'] === 'number' ? c['expirationDate'] : undefined,
      sameSite:
        c['sameSite'] === 'no_restriction' ||
        c['sameSite'] === 'lax' ||
        c['sameSite'] === 'strict' ||
        c['sameSite'] === 'unspecified'
          ? c['sameSite']
          : undefined,
    };
  });
}

/**
 * Build the `url` a `session.cookies.set` call needs from a stored cookie's
 * domain/path/secure. A leading-dot domain (`.blipfoto.com`) becomes a bare
 * host; the scheme follows `secure`.
 */
export function cookieSetUrl(c: WebCookie): string {
  const host = c.domain.replace(/^\./, '') || BLIPFOTO_COOKIE_DOMAIN;
  const scheme = c.secure ? 'https' : 'http';
  const path = c.path && c.path.startsWith('/') ? c.path : '/';
  return `${scheme}://${host}${path}`;
}
