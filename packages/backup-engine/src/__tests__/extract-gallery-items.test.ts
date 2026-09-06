// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { extractGalleryItems } from '../backup-engine.js';

const MARKER = 'blipfoto.data.gallery = ';

function pageWith(galleryJson: string): string {
  return (
    '<!doctype html><html><head><script>window.other = {a:{b:1}};</script></head><body>' +
    `<script>blipfoto.data.entry = {id:"1"}; ${MARKER}${galleryJson}; blipfoto.data.more = {x:{y:2}};</script>` +
    '</body></html>'
  );
}

describe('extractGalleryItems', () => {
  it('parses a multi-item gallery, preserving relative vs absolute original URLs', () => {
    const html = pageWith(
      JSON.stringify({
        items: [
          {
            item_id_str: '111',
            thumbnail_url: 'https://cdn.example/t/111.jpg',
            image_urls: {
              stdres: 'https://cdn.example/s/111.jpg',
              hires: 'https://cdn.example/h/111.jpg',
              original: '/img/o/111.jpg',
            },
          },
          {
            item_id_str: '222',
            thumbnail_url: 'https://cdn.example/t/222.jpg',
            image_urls: { original: 'https://cdn.example/o/222.jpg' },
          },
        ],
      }),
    );

    const items = extractGalleryItems(html);
    if (items === null) throw new Error('expected items, got null');
    expect(items).toHaveLength(2);
    expect(items[0]?.item_id_str).toBe('111');
    expect(items[0]?.image_urls?.original).toBe('/img/o/111.jpg');
    expect(items[0]?.image_urls?.hires).toBe('https://cdn.example/h/111.jpg');
    expect(items[1]?.item_id_str).toBe('222');
    expect(items[1]?.image_urls?.original).toBe('https://cdn.example/o/222.jpg');
  });

  it('returns [] for an explicitly empty items array (not null)', () => {
    expect(extractGalleryItems(pageWith('{"items":[]}'))).toEqual([]);
  });

  it('returns null when the gallery marker is absent', () => {
    expect(extractGalleryItems('<html><body>no gallery here</body></html>')).toBeNull();
  });

  it('returns null when the object is truncated before its closing brace', () => {
    expect(extractGalleryItems(`<script>${MARKER}{"items":[{"item_id_str":"1"`)).toBeNull();
  });

  it('returns null when the blob is not valid JSON', () => {
    expect(extractGalleryItems(`<script>${MARKER}{items: [1, 2, 3]};</script>`)).toBeNull();
  });

  it('returns null when the JSON is valid but has no items key', () => {
    expect(extractGalleryItems(pageWith('{"count":0}'))).toBeNull();
  });
});
