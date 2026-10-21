// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// "Download photo" — the owner action on an entry (b-oss#175). It saves the entry's main (display)
// image to the gallery, and ONLY for an entry in the signed-in account's own journal: this app must
// never offer someone else's photo for download. The screen only shows the button on your own
// entries, but the rule is enforced here too so no future caller can bypass it.

import type { BlipEntry } from '@b-oss/b-view';
import { saveRemoteImageToGallery } from '../platform/mediaSave.js';

export class NotYourEntryError extends Error {
  constructor() {
    super('You can only download photos from your own journal.');
    this.name = 'NotYourEntryError';
  }
}

export class NoImageError extends Error {
  constructor() {
    super('This entry has no photo to download.');
    this.name = 'NoImageError';
  }
}

/** Where the file will be called `blipfoto-<username>-<date>-<entryId>` (extension added from the
 * actual image type by the platform layer). */
export function downloadFileName(entry: Pick<BlipEntry, 'username' | 'date' | 'entry_id'>): string {
  return `blipfoto-${entry.username}-${entry.date}-${entry.entry_id}`;
}

/** Resolves to the saved location (e.g. "Pictures/b-mobile/…jpg"), or `null` off-device. */
export async function downloadOwnEntryImage(
  entry: Pick<BlipEntry, 'username' | 'date' | 'entry_id' | 'images'>,
  activeUsername: string | null | undefined,
): Promise<string | null> {
  if (!activeUsername || entry.username !== activeUsername) throw new NotYourEntryError();
  const url = entry.images.image;
  if (!url) throw new NoImageError();
  return saveRemoteImageToGallery(url, downloadFileName(entry));
}
