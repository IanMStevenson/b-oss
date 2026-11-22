// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Adding extra photos to a published entry through Blipfoto's own website (b-oss#1037). The entry
// itself goes through the API as usual (composeFlow.ts); this runs after it, so a failure here
// never costs the member their entry. Every failure comes back as a `manual` outcome naming the
// reason and the entry's edit page, for the "finish it in your browser" screen; nothing here throws.

import {
  WHO_AM_I_URL,
  SIGN_IN_URL,
  buildAddExtrasScript,
  buildPageHtmlScript,
  buildReadBackScript,
  buildRemainingScript,
  PUBLISH_URL,
  type RemainingResult,
  buildWhoAmIScript,
  editPageUrl,
  type AddScriptResult,
  type ExtraFile,
  type PageHtmlResult,
  type ReadBackResult,
  type WhoAmIResult,
} from '../platform/siteExtrasScripts.js';
import { entryPageUrl, fetchEntryExtras, type EntryExtra } from '@b-oss/b-api';
import {
  siteRunPage,
  siteSessionAvailable,
  siteSignIn,
  siteSignOut,
} from '../platform/siteSession.js';

/** The most extras one entry gets from the app in one go; the page itself allows far more, but
 * each photo travels through the page as base64, so the app keeps the batch modest. */
export const MAX_EXTRAS = 10;

export type ExtrasFailure =
  | 'unavailable'
  | 'not-signed-in'
  | 'wrong-account'
  | 'no-membership'
  | 'unexpected-page'
  | 'timeout'
  | 'not-kept'
  | 'error';

export type ExtrasOutcome =
  | { kind: 'done'; added: number }
  | { kind: 'partial'; added: number; total: number; editUrl: string }
  | { kind: 'manual'; reason: ExtrasFailure; total: number; editUrl: string };

export { SIGN_IN_URL };

function parse<T>(json: string | null): T | null {
  if (json === null) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/** Who the stored website session belongs to: the member's name, '' if signed in but unnamed, or
 * null if not signed in (or the check could not run). */
export async function currentSiteUser(): Promise<string | null> {
  if (!siteSessionAvailable()) return null;
  try {
    const { result } = await siteRunPage({
      url: WHO_AM_I_URL,
      script: buildWhoAmIScript(),
      timeoutMs: 30_000,
      waitForNavigation: false,
    });
    const who = parse<WhoAmIResult>(result);
    return who?.status === 'ok' ? (who.user ?? '') : null;
  } catch {
    return null;
  }
}

/** Shows the site's sign-in page. True once the member has signed in. */
export function signInToSite(): Promise<boolean> {
  return siteSignIn(SIGN_IN_URL).catch(() => false);
}

/** When a member disconnects their account: deletes the stored website session if it is theirs
 * (or unnamed), so its cookie does not outlive the account. Another member's session is left
 * alone. Best effort: never throws, because removing the account must not depend on it. */
export async function forgetSiteSession(username: string): Promise<void> {
  try {
    if (!siteSessionAvailable()) return;
    const who = await currentSiteUser();
    if (who !== null && isSameMember(who, username)) await siteSignOut();
  } catch {
    // Nothing more to do; the account is removed regardless.
  }
}

/** Whether the stored session is this member's (case-insensitive). An unnamed session is accepted:
 * the edit page itself then decides. */
export function isSameMember(siteUser: string | null, username: string): boolean {
  return (
    siteUser !== null && (siteUser === '' || siteUser.toLowerCase() === username.toLowerCase())
  );
}

async function readBack(entryId: string): Promise<ReadBackResult | null> {
  const { result } = await siteRunPage({
    url: editPageUrl(entryId),
    script: buildReadBackScript(),
    timeoutMs: 45_000,
    waitForNavigation: false,
  });
  return parse<ReadBackResult>(result);
}

/** base64 of a picked photo, read through the URL the app already shows it with. */
export async function photoToExtraFile(photo: {
  webPath: string;
  mimeType: string;
}): Promise<ExtraFile> {
  const blob = await (await fetch(photo.webPath)).blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // In slices: spreading one huge array into String.fromCharCode overflows the call stack.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  const base64 = btoa(binary);
  const ext = photo.mimeType.includes('png') ? 'png' : 'jpg';
  return { name: `extra.${ext}`, mimeType: photo.mimeType || 'image/jpeg', base64 };
}

/** Adds `photos` to the entry's extras: reads the edit page first (so a wrong account or a
 * missing session is caught before anything is sent), hands the page the photos, lets its own
 * Save run, then reads the page again to confirm they were kept. */
export async function addExtras(
  entryId: string,
  username: string,
  photos: { webPath: string; mimeType: string }[],
): Promise<ExtrasOutcome> {
  const editUrl = editPageUrl(entryId);
  const total = photos.length;
  const manual = (reason: ExtrasFailure): ExtrasOutcome => ({
    kind: 'manual',
    reason,
    total,
    editUrl,
  });
  if (!siteSessionAvailable()) return manual('unavailable');
  try {
    const before = await readBack(entryId);
    if (before === null) return manual('error');
    if (before.status === 'needs-login') return manual('not-signed-in');
    if (before.status === 'unexpected-page') return manual('unexpected-page');
    if (before.status === 'no-uploader') return manual('no-membership');
    if (!isSameMember(before.user ?? '', username)) return manual('wrong-account');

    const files = await Promise.all(photos.map(photoToExtraFile));
    const { result } = await siteRunPage({
      url: editUrl,
      script: buildAddExtrasScript(files),
      timeoutMs: 180_000,
      waitForNavigation: true,
    });
    const sent = parse<AddScriptResult>(result);
    if (sent === null) return manual('timeout');
    if (sent.status === 'needs-login') return manual('not-signed-in');
    if (sent.status === 'unexpected-page') return manual('unexpected-page');
    if (sent.status === 'no-uploader') return manual('no-membership');
    if (sent.status === 'timeout') return manual('timeout');
    if (sent.status === 'error') return manual('error');

    const after = await readBack(entryId);
    if (after?.status !== 'ok') return manual('not-kept');
    const added = (after.count ?? 0) - (before.count ?? 0);
    if (added >= total) return { kind: 'done', added: total };
    if (added > 0) return { kind: 'partial', added, total, editUrl };
    return manual('not-kept');
  } catch {
    return manual('error');
  }
}

/** The one-line explanation for the manual screen. */
export function describeExtrasFailure(reason: ExtrasFailure): string {
  switch (reason) {
    case 'not-signed-in':
      return 'You were not signed in to the Blipfoto website.';
    case 'wrong-account':
      return 'The Blipfoto website is signed in as a different member.';
    case 'no-membership':
      return 'Blipfoto did not offer extra photos for this entry (they need a membership).';
    case 'unexpected-page':
      return 'The Blipfoto edit page did not look as expected.';
    case 'timeout':
      return 'Blipfoto took too long to take the photos.';
    case 'not-kept':
      return 'Blipfoto did not keep the photos.';
    case 'unavailable':
      return 'Extra photos are not available on this device.';
    case 'error':
      return 'Something went wrong adding the photos.';
  }
}

/** The extras of an entry read with the stored website session, for a protected journal whose
 * public page shows no gallery. 'needs-login' means there is no usable session (so the caller
 * offers to sign in); 'failed' is anything else, treated as no extras. */
export async function readExtrasViaSession(
  entryId: string,
): Promise<{ kind: 'ok'; extras: EntryExtra[] } | { kind: 'needs-login' } | { kind: 'failed' }> {
  if (!siteSessionAvailable()) return { kind: 'failed' };
  try {
    const { result } = await siteRunPage({
      url: entryPageUrl(entryId),
      script: buildPageHtmlScript(),
      timeoutMs: 45_000,
      waitForNavigation: false,
    });
    const page = parse<PageHtmlResult>(result);
    if (page === null) return { kind: 'failed' };
    if (page.status === 'needs-login' || typeof page.html !== 'string') {
      return page.status === 'needs-login' ? { kind: 'needs-login' } : { kind: 'failed' };
    }
    const html = page.html;
    const read = await fetchEntryExtras(entryId, () => Promise.resolve(html));
    if (read.status === 'ok') return { kind: 'ok', extras: read.extras };
    // Still protected with a session means it belongs to a member who may not view this journal.
    return read.status === 'protected' ? { kind: 'needs-login' } : { kind: 'failed' };
  } catch {
    return { kind: 'failed' };
  }
}

/** The member's remaining extras allowance for the year, from the website; null when it cannot be
 * read (not signed in, not a member, no website session on this device). Never throws. */
export async function readExtrasRemaining(): Promise<number | null> {
  if (!siteSessionAvailable()) return null;
  try {
    const { result } = await siteRunPage({
      url: PUBLISH_URL,
      script: buildRemainingScript(),
      timeoutMs: 30_000,
      waitForNavigation: false,
    });
    const read = parse<RemainingResult>(result);
    return read?.status === 'ok' && typeof read.remaining === 'number' ? read.remaining : null;
  } catch {
    return null;
  }
}
