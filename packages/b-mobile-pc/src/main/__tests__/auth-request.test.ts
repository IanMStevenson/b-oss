// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import {
  AuthRequestError,
  isAllowedNavigation,
  withOrigin,
  reachedRedirect,
  validateAuthRequest,
} from '../auth-request.js';

const good =
  'https://www.blipfoto.com/oauth/authorize?client_id=x&redirect_uri=bmobile%3A%2F%2Foauth%2F';

describe('validateAuthRequest', () => {
  it('accepts the sign-in host with a custom-scheme redirect', () => {
    expect(validateAuthRequest(good, 'bmobile://oauth/')).toEqual({
      url: good,
      redirectPrefix: 'bmobile://oauth/',
    });
  });

  it('rejects other hosts, http, and non-strings', () => {
    for (const url of [
      'https://evil.example/oauth/authorize',
      'http://www.blipfoto.com/oauth/authorize',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'nope',
    ]) {
      expect(() => validateAuthRequest(url, 'bmobile://oauth/')).toThrow(AuthRequestError);
    }
    expect(() => validateAuthRequest(1, 'bmobile://oauth/')).toThrow(AuthRequestError);
    expect(() => validateAuthRequest(good, undefined)).toThrow(AuthRequestError);
  });

  it('does not accept a lookalike host', () => {
    expect(() =>
      validateAuthRequest('https://www.blipfoto.com.evil.example/x', 'bmobile://oauth/'),
    ).toThrow(AuthRequestError);
    expect(() =>
      validateAuthRequest('https://www.blipfoto.com@evil.example/x', 'bmobile://oauth/'),
    ).toThrow(AuthRequestError);
  });

  it('requires a custom-scheme redirect, never http(s), file or the app scheme', () => {
    for (const prefix of [
      'https://www.blipfoto.com/',
      'http://x/',
      'file:///x',
      'app://b-mobile/',
      'oauth/',
      '',
    ]) {
      expect(() => validateAuthRequest(good, prefix)).toThrow(AuthRequestError);
    }
  });

  it('allows extra hosts and plain http only when a test asks for them', () => {
    const url = 'http://127.0.0.1:5193/oauth/authorize?state=s';
    expect(() => validateAuthRequest(url, 'bmobile://oauth/')).toThrow(AuthRequestError);
    expect(validateAuthRequest(url, 'bmobile://oauth/', ['127.0.0.1:5193'], true).url).toBe(url);
  });
});

describe('reachedRedirect', () => {
  it('matches the prefix case-insensitively, including a fragment', () => {
    expect(reachedRedirect('bmobile://oauth/#access_token=t&state=s', 'bmobile://oauth/')).toBe(
      true,
    );
    expect(reachedRedirect('BMOBILE://OAUTH/?error=access_denied', 'bmobile://oauth/')).toBe(true);
    expect(reachedRedirect('https://www.blipfoto.com/login', 'bmobile://oauth/')).toBe(false);
  });
});

describe('isAllowedNavigation', () => {
  it('allows https, and http only when asked', () => {
    expect(isAllowedNavigation('https://www.blipfoto.com/login')).toBe(true);
    expect(isAllowedNavigation('https://accounts.example/oauth')).toBe(true);
    expect(isAllowedNavigation('http://127.0.0.1:5193/x')).toBe(false);
    expect(isAllowedNavigation('http://127.0.0.1:5193/x', true)).toBe(true);
  });

  it('blocks every other scheme and garbage', () => {
    for (const target of [
      'file:///etc/passwd',
      'app://b-mobile/',
      'data:text/html,hi',
      'javascript:alert(1)',
      'bmobile://other/',
      'not a url',
    ]) {
      expect(isAllowedNavigation(target, true)).toBe(false);
    }
  });
});

describe('withOrigin (test hook)', () => {
  it('keeps the path and query and swaps the origin', () => {
    expect(
      withOrigin(
        'https://www.blipfoto.com/oauth/authorize?state=s&scope=read',
        'http://127.0.0.1:5193',
      ),
    ).toBe('http://127.0.0.1:5193/oauth/authorize?state=s&scope=read');
  });
});
