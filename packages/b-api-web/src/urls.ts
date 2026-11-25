// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The Blipfoto website's origin and the URLs an app builds or links to. Everything that needs "the
// site's address" takes it from here rather than writing a literal.

export const SITE_HOST = 'www.blipfoto.com';
export const SITE_ORIGIN = `https://${SITE_HOST}`;

/** A page on the site, from a path that starts with `/`. */
export function siteUrl(path: string): string {
  return `${SITE_ORIGIN}${path}`;
}

/** A member's public entry page (its `entry_id_str`). */
export function entryUrl(entryId: string): string {
  return siteUrl(`/entry/${encodeURIComponent(entryId)}`);
}

/** The page where a member edits one of their own entries (and its extra photos). */
export function entryEditUrl(entryId: string): string {
  return siteUrl(`/entry/${encodeURIComponent(entryId)}/edit`);
}

/** A member's journal. */
export function profileUrl(username: string): string {
  return siteUrl(`/${encodeURIComponent(username)}`);
}

export const SIGN_IN_URL = siteUrl('/account/signin');
export const SIGN_UP_URL = siteUrl('/account/signup');
/** The member's own new-entry page, which shows their remaining extras allowance. */
export const PUBLISH_URL = siteUrl('/publish');
/** A page only a signed-in member can see, used to learn who the website is signed in as. */
export const SETTINGS_URL = siteUrl('/settings/general');
/** Where a member deletes their own account (it cannot be done from an app). */
export const DELETE_ACCOUNT_URL = siteUrl('/settings/profile#sidebar');

export const HELP_URL = siteUrl('/help');
export const TERMS_URL = siteUrl('/legal/terms');
export const ACCEPTABLE_USE_URL = siteUrl('/legal/acceptable-use');
export const PRIVACY_URL = siteUrl('/legal/privacy');
export const BE_EXCELLENT_URL = siteUrl('/be-excellent');
/** Where the site serves its small icon images from (append a file name). */
export const ICON_BASE_URL = siteUrl('/_assets/images/icons/');
