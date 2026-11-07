// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const access = vi.hoisted(() => ({ value: 'direct' }));
const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('../capabilities.js', () => ({ capabilities: () => ({ api: { access: access.value } }) }));
vi.mock('../http.js', () => ({ platformFetch: fetchMock }));

import { fetchSiteText, siteUrlFor, SITE_PROXY_PREFIX } from '../siteText.js';

beforeEach(() => {
  fetchMock.mockReset();
  access.value = 'direct';
});

describe('siteText', () => {
  it('uses the real URL where requests are direct', () => {
    expect(siteUrlFor('https://www.blipfoto.com/entry/1')).toBe('https://www.blipfoto.com/entry/1');
  });

  it('maps to the same-origin proxy prefix otherwise', () => {
    access.value = 'same-origin-proxy';
    expect(siteUrlFor('https://www.blipfoto.com/entry/1')).toBe(
      `${window.location.origin}${SITE_PROXY_PREFIX}entry/1`,
    );
    expect(() => siteUrlFor('https://evil.example/entry/1')).toThrow();
  });

  it('returns the body, and throws on a non-2xx status', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 200 }));
    await expect(fetchSiteText('https://www.blipfoto.com/entry/1')).resolves.toBe('<html>');
    fetchMock.mockResolvedValueOnce(new Response('no', { status: 404 }));
    await expect(fetchSiteText('https://www.blipfoto.com/entry/1')).rejects.toThrow('404');
  });
});
