// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

/**
 * Fetch an entry's extra photos from its public (logged-out) entry page.
 *
 * SCRAPING STOP-GAP: the Blipfoto API does not expose an entry's extras, so this reads the
 * gallery data embedded in the public page. Replace this module with an API call when the API
 * exposes extras; keep it the only place that knows about the page.
 *
 * The caller injects the text fetch (b-api has no platform HTTP). Only thumbnail and
 * standard-resolution URLs are returned: original/hires are never exposed.
 */

import { GALLERY_MARKER, extractGalleryItems } from './gallery.js';

/** Fetch a URL and resolve with the response body as text; reject (or throw) on failure. */
export type TextFetcher = (url: string) => Promise<string>;

/** One extra photo. Maps directly onto b-view's `images.extras[]` entry:
 * `item_id` → `item_id`, `thumbnail` → `thumbnail`, `image` → `image`. */
export interface EntryExtra {
  item_id: string;
  thumbnail: string;
  /** Standard-resolution image URL. */
  image: string;
}

export type EntryExtrasResult =
  /** Page fetched and understood. `extras` is empty when the entry has no gallery or one photo. */
  | { status: 'ok'; extras: EntryExtra[] }
  /** Fetch threw, or the gallery data was present but unreadable. Worth retrying later. */
  | { status: 'failed'; reason: 'fetch' | 'parse' };

export function entryPageUrl(entryId: string): string {
  return `https://www.blipfoto.com/entry/${encodeURIComponent(entryId)}`;
}

export async function fetchEntryExtras(
  entryId: string,
  fetchText: TextFetcher,
): Promise<EntryExtrasResult> {
  let html: string;
  try {
    html = await fetchText(entryPageUrl(entryId));
  } catch {
    return { status: 'failed', reason: 'fetch' };
  }
  if (typeof html !== 'string') return { status: 'failed', reason: 'fetch' };

  const items = extractGalleryItems(html);
  if (items === null) {
    // No marker: the page has no gallery. Marker present but unreadable: a parse failure.
    return html.includes(GALLERY_MARKER)
      ? { status: 'failed', reason: 'parse' }
      : { status: 'ok', extras: [] };
  }

  const extras: EntryExtra[] = [];
  for (const item of items.slice(1)) {
    const image = item.image_urls?.stdres;
    if (!item.item_id_str || !image) continue;
    extras.push({ item_id: item.item_id_str, thumbnail: item.thumbnail_url || image, image });
  }
  return { status: 'ok', extras };
}
