// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import {
  classifyScrapeResponse,
  cookieSetUrl,
  deserializeCookies,
  isLoginUrl,
  isSignedInFromCookies,
  looksLikeLoginPage,
  serializeCookies,
  type WebCookie,
} from '../web-session-pure.js';

const sessionCookie = (over: Partial<WebCookie> = {}): WebCookie => ({
  name: 'BLIPFOTO_SESSION',
  value: 'abc123',
  domain: '.blipfoto.com',
  path: '/',
  secure: false,
  httpOnly: true,
  ...over,
});

const LOGIN_HTML =
  '<form method="post"><input type="email" name="email"><input type="password" name="password"></form>';
const ENTRY_HTML = '<html><body><script>blipfoto.data.gallery = {"items":[]};</script></body></html>';

describe('isLoginUrl', () => {
  it('is true for the sign-in path and its children', () => {
    expect(isLoginUrl('https://www.blipfoto.com/account/signin')).toBe(true);
    expect(isLoginUrl('https://www.blipfoto.com/account/signin/')).toBe(true);
    expect(isLoginUrl('https://www.blipfoto.com/login?redir=/x')).toBe(true);
  });
  it('is false for a normal entry page and for junk', () => {
    expect(isLoginUrl('https://www.blipfoto.com/entry/2199999')).toBe(false);
    expect(isLoginUrl('not a url')).toBe(false);
  });
});

describe('looksLikeLoginPage', () => {
  it('detects the sign-in form', () => {
    expect(looksLikeLoginPage(LOGIN_HTML)).toBe(true);
  });
  it('does not fire on a rendered entry page', () => {
    expect(looksLikeLoginPage(ENTRY_HTML)).toBe(false);
  });
});

describe('isSignedInFromCookies', () => {
  it('true for a present, non-expired session cookie', () => {
    expect(isSignedInFromCookies([sessionCookie()])).toBe(true);
  });
  it('true when expirationDate is in the future', () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    expect(isSignedInFromCookies([sessionCookie({ expirationDate: future })])).toBe(true);
  });
  it('false when the session cookie has expired', () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    expect(isSignedInFromCookies([sessionCookie({ expirationDate: past })])).toBe(false);
  });
  it('false when the session cookie value is empty', () => {
    expect(isSignedInFromCookies([sessionCookie({ value: '' })])).toBe(false);
  });
  it('false when no session cookie is present', () => {
    expect(isSignedInFromCookies([sessionCookie({ name: 'other' })])).toBe(false);
    expect(isSignedInFromCookies([])).toBe(false);
  });
});

describe('classifyScrapeResponse', () => {
  it('ok for a 200 that stayed on an entry URL with real content', () => {
    expect(
      classifyScrapeResponse({
        status: 200,
        finalUrl: 'https://www.blipfoto.com/entry/123',
        body: ENTRY_HTML,
      }),
    ).toBe('ok');
  });
  it('expired when redirected to the sign-in page', () => {
    expect(
      classifyScrapeResponse({
        status: 200,
        finalUrl: 'https://www.blipfoto.com/account/signin',
        body: '',
      }),
    ).toBe('expired');
  });
  it('expired on 401/403', () => {
    expect(
      classifyScrapeResponse({ status: 403, finalUrl: 'https://www.blipfoto.com/entry/1', body: '' }),
    ).toBe('expired');
  });
  it('expired when a 200 body is actually the sign-in form', () => {
    expect(
      classifyScrapeResponse({
        status: 200,
        finalUrl: 'https://www.blipfoto.com/entry/1',
        body: LOGIN_HTML,
      }),
    ).toBe('expired');
  });
});

describe('cookie (de)serialisation', () => {
  it('round-trips a cookie array', () => {
    const cookies: WebCookie[] = [
      sessionCookie({ expirationDate: 1893456000 }),
      { name: 'pref', value: 'x', domain: '.blipfoto.com', path: '/', secure: true, httpOnly: false, sameSite: 'lax' },
    ];
    expect(deserializeCookies(serializeCookies(cookies))).toEqual(cookies);
  });
  it('fills defaults for a sparse serialised cookie', () => {
    const [c] = deserializeCookies(JSON.stringify([{ name: 'BLIPFOTO_SESSION', value: 'v' }]));
    expect(c).toMatchObject({ domain: 'blipfoto.com', path: '/', secure: false, httpOnly: false });
  });
  it('rejects a non-array blob', () => {
    expect(() => deserializeCookies('{"name":"x"}')).toThrow();
  });
});

describe('cookieSetUrl', () => {
  it('builds an https URL from a secure leading-dot-domain cookie', () => {
    expect(
      cookieSetUrl({ name: 'a', value: 'b', domain: '.blipfoto.com', path: '/x', secure: true, httpOnly: false }),
    ).toBe('https://blipfoto.com/x');
  });
  it('uses http when the cookie is not secure and defaults a blank path', () => {
    expect(
      cookieSetUrl({ name: 'a', value: 'b', domain: 'blipfoto.com', path: '', secure: false, httpOnly: false }),
    ).toBe('http://blipfoto.com/');
  });
});
