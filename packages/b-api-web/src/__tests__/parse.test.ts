// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import { isSiteLink, parseSiteUrl, pathOf, targetOfPath } from '../parse.js';

describe('isSiteLink', () => {
  it.each([
    ['/entry/1', true],
    ['https://www.blipfoto.com/entry/1', true],
    ['http://blipfoto.com/ian', true],
    ['//evil.example/entry/1', false],
    ['https://evil.example/entry/1', false],
    ['https://www.blipfoto.com.evil.example/', false],
    ['mailto:a@b.c', false],
    ['not a url', false],
  ])('%s -> %s', (href, expected) => {
    expect(isSiteLink(href)).toBe(expected);
  });
});

describe('pathOf', () => {
  it('normalises absolute and relative links alike', () => {
    expect(pathOf('https://www.blipfoto.com/Entry/55/')).toBe('entry/55');
    expect(pathOf('/Ian')).toBe('ian');
  });
});

describe('parseSiteUrl', () => {
  it('knows an entry, a profile and the follow-requests page', () => {
    expect(parseSiteUrl('https://www.blipfoto.com/entry/3571304895526996959')).toEqual({
      kind: 'entry',
      entryId: '3571304895526996959',
    });
    expect(parseSiteUrl('https://blipfoto.com/cyclopstest')).toEqual({
      kind: 'profile',
      username: 'cyclopstest',
    });
    expect(parseSiteUrl('/me/followers/requests')).toEqual({ kind: 'follow-request' });
  });

  it('is null for anything else: site sections, deeper paths, other sites', () => {
    expect(parseSiteUrl('https://www.blipfoto.com/store')).toBeNull();
    expect(parseSiteUrl('https://www.blipfoto.com/me')).toBeNull();
    expect(parseSiteUrl('https://www.blipfoto.com/ian/extra/path')).toBeNull();
    expect(parseSiteUrl('https://example.com/entry/1')).toBeNull();
  });

  it('targetOfPath works on an already normalised path', () => {
    expect(targetOfPath('entry/9')).toEqual({ kind: 'entry', entryId: '9' });
    expect(targetOfPath('')).toBeNull();
  });
});
