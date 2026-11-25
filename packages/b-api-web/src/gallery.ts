// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

export const GALLERY_MARKER = 'blipfoto.data.gallery = ';

export interface GalleryImageUrls {
  stdres?: string;
  hires?: string;
  /** Absent, or `null` on logged-out pages despite what a signed-in page carries. */
  original?: string | null;
}

export interface GalleryItem {
  item_id_str: string;
  thumbnail_url?: string;
  image_urls?: GalleryImageUrls;
}

/**
 * Pull the `blipfoto.data.gallery = {…}` JSON blob out of a rendered Blipfoto
 * entry page. Server-rendered today; a string scan (not a DOM parse) keeps this
 * usable from any platform. Returns `gallery.items` or `null` when the marker is
 * absent / the JSON is unbalanced or unparseable. Exported for direct unit
 * testing — production callers go through `BackupEngine.fetchGalleryData`.
 */
export function extractGalleryItems(html: string): GalleryItem[] | null {
  const start = html.indexOf(GALLERY_MARKER);
  if (start === -1) return null;
  const jsonStart = start + GALLERY_MARKER.length;
  // The JSON object ends at the first semicolon after a closing brace at the top level.
  // Walk forward tracking brace depth to find the end.
  let depth = 0;
  let end = -1;
  for (let i = jsonStart; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) return null;
  try {
    const gallery = JSON.parse(html.slice(jsonStart, end)) as { items?: GalleryItem[] };
    return gallery.items ?? null;
  } catch {
    return null;
  }
}
