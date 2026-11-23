// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import {
  isSignedInLanding,
  partitionFor,
  validateSiteRun,
  validateSiteUrl,
} from '../site-request.js';

describe('validateSiteUrl', () => {
  it('accepts https pages on the site host', () => {
    expect(validateSiteUrl('https://www.blipfoto.com/entry/1/edit')).toBe(
      'https://www.blipfoto.com/entry/1/edit',
    );
  });

  it.each([
    'http://www.blipfoto.com/',
    'https://evil.example/',
    'https://www.blipfoto.com.evil.example/',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'not a url',
    42,
  ])('refuses %s', (url) => {
    expect(() => validateSiteUrl(url)).toThrow();
  });
});

describe('validateSiteRun', () => {
  const ok = {
    accountId: 'acct-1',
    url: 'https://www.blipfoto.com/entry/1/edit',
    script: '1',
    timeoutMs: 5000,
    waitForNavigation: true,
  };

  it('accepts a well-formed run', () => {
    expect(validateSiteRun(ok)).toEqual(ok);
  });

  it.each([
    { ...ok, script: '' },
    { ...ok, timeoutMs: 10 },
    { ...ok, timeoutMs: 99_999_999 },
    { ...ok, waitForNavigation: 'yes' },
    { ...ok, accountId: '' },
    { ...ok, accountId: 42 },
    { ...ok, url: 'https://evil.example/' },
    null,
  ])('refuses %j', (run) => {
    expect(() => validateSiteRun(run)).toThrow();
  });
});

describe('isSignedInLanding', () => {
  it('is true once past /account/', () => {
    expect(isSignedInLanding('https://www.blipfoto.com/browse')).toBe(true);
    expect(isSignedInLanding('https://www.blipfoto.com/account/signin')).toBe(false);
    expect(isSignedInLanding('https://www.facebook.com/dialog/oauth')).toBe(false);
  });
});

describe('partitionFor', () => {
  it('is stable per account and different between accounts, whatever the id looks like', () => {
    expect(partitionFor('a')).toBe(partitionFor('a'));
    expect(partitionFor('a')).not.toBe(partitionFor('b'));
    expect(partitionFor('x/../y')).toMatch(/^persist:blipfoto-site-[0-9a-f]{24}$/);
  });
});
