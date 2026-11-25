// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import {
  entryEditUrl,
  entryUrl,
  profileUrl,
  resolveSiteUrl,
  siteUrl,
  SITE_ORIGIN,
} from '../urls.js';

describe('urls', () => {
  it('builds site URLs from the one origin', () => {
    expect(SITE_ORIGIN).toBe('https://www.blipfoto.com');
    expect(siteUrl('/help')).toBe('https://www.blipfoto.com/help');
    expect(entryUrl('123')).toBe('https://www.blipfoto.com/entry/123');
    expect(entryEditUrl('123')).toBe('https://www.blipfoto.com/entry/123/edit');
    expect(profileUrl('ian')).toBe('https://www.blipfoto.com/ian');
  });

  it('escapes what it is given, so an id or a name can never change the path', () => {
    expect(entryEditUrl('../x')).not.toContain('/../');
    expect(profileUrl('a/b')).toBe('https://www.blipfoto.com/a%2Fb');
  });
});

describe('resolveSiteUrl', () => {
  it('leaves an absolute URL alone and puts a site path on the origin', () => {
    expect(resolveSiteUrl('https://img.example/a.jpg')).toBe('https://img.example/a.jpg');
    expect(resolveSiteUrl('/_uploads/a.jpg')).toBe('https://www.blipfoto.com/_uploads/a.jpg');
  });
});
