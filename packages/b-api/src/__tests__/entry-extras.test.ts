// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { fetchEntryExtras } from '../entry-extras.js';
import { LOGGED_OUT_ENTRY_PAGE } from './fixtures/logged-out-entry-page.js';

describe('fetchEntryExtras', () => {
  it('returns the items after the first, standard resolution only', async () => {
    let url = '';
    const r = await fetchEntryExtras('123', (u) => {
      url = u;
      return Promise.resolve(LOGGED_OUT_ENTRY_PAGE);
    });
    expect(url).toBe('https://www.blipfoto.com/entry/123');
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.extras).toHaveLength(4);
    expect(r.extras.map((e) => e.item_id)).not.toContain('3411114802393646647');
    for (const e of r.extras) {
      expect(Object.keys(e).sort()).toEqual(['image', 'item_id', 'thumbnail']);
      expect(e.image).toMatch(/^https:\/\//);
      expect(e.thumbnail).toMatch(/^https:\/\//);
    }
  });

  it('is ok with no extras when the page has no gallery', async () => {
    expect(await fetchEntryExtras('1', () => Promise.resolve('<html>no gallery</html>'))).toEqual({
      status: 'ok',
      extras: [],
    });
  });

  it('is ok with no extras for a one-item gallery', async () => {
    const page =
      'blipfoto.data.gallery = {"items":[{"item_id_str":"1","image_urls":{"stdres":"https://x/1"}}]};';
    expect(await fetchEntryExtras('1', () => Promise.resolve(page))).toEqual({
      status: 'ok',
      extras: [],
    });
  });

  it('fails with fetch when the fetcher throws', async () => {
    expect(await fetchEntryExtras('1', () => Promise.reject(new Error('offline')))).toEqual({
      status: 'failed',
      reason: 'fetch',
    });
  });

  it('fails with parse when the gallery data is unreadable', async () => {
    expect(
      await fetchEntryExtras('1', () => Promise.resolve('blipfoto.data.gallery = {"items":[')),
    ).toEqual({
      status: 'failed',
      reason: 'parse',
    });
  });

  it('treats null original as absent and never surfaces it', async () => {
    const page =
      'blipfoto.data.gallery = {"items":[{"item_id_str":"1"},{"item_id_str":"2","thumbnail_url":"https://x/t","image_urls":{"stdres":"https://x/s","hires":"https://x/h","original":null}},{"item_id_str":"3","image_urls":{"original":null}}]};';
    expect(await fetchEntryExtras('1', () => Promise.resolve(page))).toEqual({
      status: 'ok',
      extras: [{ item_id: '2', thumbnail: 'https://x/t', image: 'https://x/s' }],
    });
  });
});
