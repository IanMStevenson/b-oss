// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// What a website session looks like from outside: which cookie carries it, how to tell a
// signed-in response from a signed-out one, and the shape a cookie is stored in. Pure data and
// functions, no platform code: the host (an Electron window and its cookie store) lives in the app.
//
// Learned from b-ark's per-account website session (confirmed live, 2026-09): Blipfoto is a plain
// Apache/PHP stack (no Cloudflare) that sets `BLIPFOTO_SESSION` on `.blipfoto.com`. The
// signed-out site sets the same cookie name for an anonymous session, so the cookie's presence
// proves nothing about being signed in. Only the sign-in form's absence (or the page naming the
// member) does: see `isSignedInFromCookies`, `looksLikeLoginPage` and `classifyScrapeResponse`.
// Where the interactive sign-in window is pointed is `SIGN_IN_URL` (urls.ts), and the origin for
// rebuilding a cookie's `url` is `SITE_ORIGIN`.

/** Cookie domain Blipfoto scopes its session to (leading dot in Set-Cookie). */
export const COOKIE_DOMAIN = 'blipfoto.com';

/** Names of the cookie(s) the site's session rides on. Present for a signed-out visitor too. */
export const SESSION_COOKIE_NAMES = ['BLIPFOTO_SESSION'];

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
  return LOGIN_PATH_PREFIXES.some(
    (p) => path === p || path.startsWith(p + '/') || path === p + '/',
  );
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
      SESSION_COOKIE_NAMES.includes(c.name) &&
      c.value.length > 0 &&
      (c.expirationDate === undefined || c.expirationDate * 1000 > nowMs),
  );
}

/**
 * Latest moment (epoch ms) at which the jar still carries a Blipfoto session
 * cookie: `Infinity` for a browser-session cookie, `null` when there is none.
 * Lets the signed-in state be re-evaluated against the clock without keeping
 * the decrypted cookies in memory.
 */
export function sessionValidUntilMs(cookies: WebCookie[]): number | null {
  let latest: number | null = null;
  for (const c of cookies) {
    if (!SESSION_COOKIE_NAMES.includes(c.name) || c.value.length === 0) continue;
    const until = c.expirationDate === undefined ? Infinity : c.expirationDate * 1000;
    if (latest === null || until > latest) latest = until;
  }
  return latest;
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
      domain: typeof c['domain'] === 'string' ? c['domain'] : COOKIE_DOMAIN,
      path: typeof c['path'] === 'string' ? c['path'] : '/',
      secure: c['secure'] === true,
      httpOnly: c['httpOnly'] === true,
      expirationDate: typeof c['expirationDate'] === 'number' ? c['expirationDate'] : undefined,
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
  const host = c.domain.replace(/^\./, '') || COOKIE_DOMAIN;
  const scheme = c.secure ? 'https' : 'http';
  const path = c.path && c.path.startsWith('/') ? c.path : '/';
  return `${scheme}://${host}${path}`;
}
