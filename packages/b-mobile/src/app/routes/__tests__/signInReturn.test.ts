// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The gated sign-in's return target comes in through the URL, so only in-app routes are accepted
// (b-oss#397).

import { describe, it, expect } from 'vitest';
import { parseReturnTo, signInPathFor, RETURN_PARAM } from '../signInReturn.js';

describe('signInPathFor / parseReturnTo', () => {
  it('round-trips a path with its query', () => {
    const path = signInPathFor('/map?entry=123');
    expect(path.startsWith('/sign-in?')).toBe(true);
    const raw = new URLSearchParams(path.split('?')[1]).get(RETURN_PARAM);
    expect(parseReturnTo(raw)).toBe('/map?entry=123');
  });

  it('accepts in-app routes', () => {
    expect(parseReturnTo('/entry/123')).toBe('/entry/123');
    expect(parseReturnTo('/compose')).toBe('/compose');
    expect(parseReturnTo('/user/alice')).toBe('/user/alice');
  });

  it.each([
    null,
    '',
    'entry/123',
    'https://example.com/',
    'javascript:alert(1)',
    '//example.com/entry/1',
    '/\\example.com',
    '/entry/1\n',
    '/sign-in',
    '/sign-in?return=/entry/1',
  ])('ignores %j', (raw) => {
    expect(parseReturnTo(raw)).toBeUndefined();
  });
});
