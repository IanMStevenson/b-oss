// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// What gets shared for an entry or a profile (b-oss#417): the public blipfoto.com URL — the same
// `entry/{id}` / `{username}` shapes deepLinkResolver parses — and the text that travels with it.

import type { BlipUserDetails } from '@b-oss/b-api';

const SITE = 'https://www.blipfoto.com';

export function entryShareUrl(entryId: string): string {
  return `${SITE}/entry/${encodeURIComponent(entryId)}`;
}

export function profileShareUrl(username: string): string {
  return `${SITE}/${encodeURIComponent(username)}`;
}

/** "{title} by {username}", or just "Entry by {username}" for an untitled entry. */
export function entryShareText(title: string | null | undefined, username: string): string {
  const trimmed = title?.trim();
  return trimmed ? `${trimmed} by ${username}` : `Entry by ${username}`;
}

/** "{journal_title} on Blipfoto", falling back to the username when there is no journal title. */
export function profileShareText(
  journalTitle: string | null | undefined,
  username: string,
): string {
  const trimmed = journalTitle?.trim();
  return `${trimmed || username} on Blipfoto`;
}

/** Whether a journal is protected, from a profile response. `details.privacy` is only returned
 * when the viewer can see the journal; `visibility` 0 means exactly "protected and the viewer is
 * neither the owner nor an accepted follower" (unavailable members come back as errors instead). */
export function isJournalProtected(profile: {
  details: BlipUserDetails | null;
  visible: boolean;
}): boolean {
  return profile.details?.privacy === 1 || !profile.visible;
}
