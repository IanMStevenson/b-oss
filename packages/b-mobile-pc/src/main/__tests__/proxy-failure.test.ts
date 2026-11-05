// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import { proxyStatusEntry, proxyThrownEntry, safePath } from '../proxy-failure.js';

const url = 'https://api.blipfoto.com/4/user/profile?access_token=SECRET123&x=1#frag';

describe('safePath', () => {
  it('drops the query and fragment', () => {
    expect(safePath(url)).toBe('/4/user/profile');
  });
  it('copes with a non-URL', () => {
    expect(safePath('not a url')).toBe('(unparseable url)');
  });
});

describe('proxyThrownEntry', () => {
  it('records method, path and the real error, but not the query', () => {
    const e = proxyThrownEntry('GET', url, new Error('net::ERR_NAME_NOT_RESOLVED'));
    expect(e.source).toBe('api-proxy');
    expect(e.message).toBe('GET /4/user/profile failed: Error: net::ERR_NAME_NOT_RESOLVED');
    expect(e.message).not.toContain('SECRET123');
  });
  it('handles a non-Error throw', () => {
    expect(proxyThrownEntry('POST', url, 'boom').message).toContain('failed: boom');
  });
});

describe('proxyStatusEntry', () => {
  it('logs 5xx with the path only', () => {
    const e = proxyStatusEntry('GET', url, 502);
    expect(e?.message).toBe('GET /4/user/profile answered 502');
  });
  it('ignores non-5xx', () => {
    expect(proxyStatusEntry('GET', url, 200)).toBeNull();
    expect(proxyStatusEntry('GET', url, 404)).toBeNull();
  });
});
