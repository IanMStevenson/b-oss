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
  type ExtraItem,
  type PageHtmlResult,
  type ReadBackResult,
  type WhoAmIResult,
} from '../platform/siteExtrasScripts.js';
import { entryPageUrl, fetchEntryExtras, type EntryExtra } from '@b-oss/b-api';
import { clearDesignatedExtrasAccount } from '../site/access.js';
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
  | { kind: 'done'; added: number; removed: number }
  | { kind: 'partial'; added: number; total: number; editUrl: string }
  | { kind: 'manual'; reason: ExtrasFailure; total: number; editUrl: string };

export { SIGN_IN_URL };

/** The b-mobile account a website action is for. The website session used must belong to exactly
 * this member: the id picks the account's own session (where the platform keeps one each), and the
 * username is what every page script checks the page against. */
export interface SiteAccount {
  id: string;
  username: string;
}

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
export async function currentSiteUser(account: SiteAccount): Promise<string | null> {
  if (!siteSessionAvailable()) return null;
  try {
    const { result } = await siteRunPage({
      accountId: account.id,
      url: WHO_AM_I_URL,
      script: buildWhoAmIScript(),
      timeoutMs: 30_000,
      waitForNavigation: false,
    });
    const who = parse<WhoAmIResult>(result);
    return who?.status === 'ok' && who.user ? who.user : null;
  } catch {
    return null;
  }
}

/** Shows the site's sign-in page for this account. True once the member has signed in. */
export function signInToSite(account: SiteAccount): Promise<boolean> {
  return siteSignIn(account.id, SIGN_IN_URL).catch(() => false);
}

/** When a member disconnects their account: deletes that account's stored website session, so its
 * cookie does not outlive the account. Best effort: never throws, because removing the account must
 * not depend on it. */
export async function forgetSiteSession(account: SiteAccount): Promise<void> {
  try {
    if (!siteSessionAvailable()) return;
    await siteSignOut(account.id);
    await clearDesignatedExtrasAccount(account.id);
  } catch {
    // Nothing more to do; the account is removed regardless.
  }
}

/** Whether the website session's member is exactly this one (case-insensitive). A session that
 * names no one proves nothing, so it never counts. */
export function isSameMember(siteUser: string | null | undefined, username: string): boolean {
  return (
    typeof siteUser === 'string' &&
    siteUser !== '' &&
    siteUser.toLowerCase() === username.toLowerCase()
  );
}

async function readBack(entryId: string, account: SiteAccount): Promise<ReadBackResult | null> {
  const { result } = await siteRunPage({
    accountId: account.id,
    url: editPageUrl(entryId),
    script: buildReadBackScript(account.username),
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

/** Adds `photos` to the entry's extras and removes the ones in `removeIds` (their ids on the site,
 * from loadEditExtras): reads the edit page first (so a wrong account or a missing session is
 * caught before anything is sent), removes and adds through the page's own controls, lets its own
 * Save run, then reads the page again to confirm the result was kept. */
export async function applyExtras(
  entryId: string,
  account: SiteAccount,
  photos: { webPath: string; mimeType: string }[],
  removeIds: string[] = [],
): Promise<ExtrasOutcome> {
  const editUrl = editPageUrl(entryId);
  const total = photos.length + removeIds.length;
  const manual = (reason: ExtrasFailure): ExtrasOutcome => ({
    kind: 'manual',
    reason,
    total,
    editUrl,
  });
  if (!siteSessionAvailable()) return manual('unavailable');
  try {
    const before = await readBack(entryId, account);
    if (before === null) return manual('error');
    if (before.status === 'needs-login') return manual('not-signed-in');
    // Whose session it is comes first (the page script has already checked it): a page for someone
    // else's entry has no uploader, which is not the same as "no membership".
    if (before.status === 'wrong-account') return manual('wrong-account');
    if (before.status === 'unexpected-page') return manual('unexpected-page');
    if (before.status === 'no-uploader') return manual('no-membership');
    const beforeIds = new Set((before.items ?? []).map((i) => i.id));
    const removable = removeIds.filter((id) => beforeIds.has(id));

    const files = await Promise.all(photos.map(photoToExtraFile));
    const { result } = await siteRunPage({
      accountId: account.id,
      url: editUrl,
      script: buildAddExtrasScript(account.username, files, removable),
      timeoutMs: 180_000,
      waitForNavigation: true,
    });
    const sent = parse<AddScriptResult>(result);
    if (sent === null) return manual('timeout');
    if (sent.status === 'needs-login') return manual('not-signed-in');
    if (sent.status === 'wrong-account') return manual('wrong-account');
    if (sent.status === 'unexpected-page') return manual('unexpected-page');
    if (sent.status === 'no-uploader') return manual('no-membership');
    if (sent.status === 'timeout') return manual('timeout');
    if (sent.status === 'error') return manual('error');

    const after = await readBack(entryId, account);
    if (after?.status !== 'ok') return manual('not-kept');
    const afterIds = new Set((after.items ?? []).map((i) => i.id));
    const added = [...afterIds].filter((id) => !beforeIds.has(id)).length;
    const removed = removable.filter((id) => !afterIds.has(id)).length;
    // An id asked to be removed that was already gone counts as removed.
    const done = added + (removed + (removeIds.length - removable.length));
    if (done >= total) return { kind: 'done', added: photos.length, removed: removeIds.length };
    if (done > 0) return { kind: 'partial', added: done, total, editUrl };
    return manual('not-kept');
  } catch {
    return manual('error');
  }
}

/** Adds `photos` to a just-published entry (see applyExtras). */
export function addExtras(
  entryId: string,
  account: SiteAccount,
  photos: { webPath: string; mimeType: string }[],
): Promise<ExtrasOutcome> {
  return applyExtras(entryId, account, photos);
}

/** What an entry's edit page lists now, for the edit screen: its current extras and the
 * allowance left. 'needs-login' means there is no usable session (the screen offers to sign in);
 * 'unavailable' means extras cannot be edited here (no session on this device, not a member, an
 * unexpected page, or another member's session). */
export async function loadEditExtras(
  entryId: string,
  account: SiteAccount,
): Promise<
  | { kind: 'ok'; items: ExtraItem[]; remaining: number | null }
  | { kind: 'needs-login' }
  | { kind: 'wrong-account'; user: string }
  | { kind: 'unavailable' }
  | { kind: 'failed' }
> {
  if (!siteSessionAvailable()) return { kind: 'unavailable' };
  try {
    const read = await readBack(entryId, account);
    // Nothing came back in time: the screen says so and offers to try again.
    if (read === null) return { kind: 'failed' };
    if (read.status === 'needs-login') return { kind: 'needs-login' };
    // Signed in to the website as someone else (the page script refused to go further): that
    // member's edit page for this entry has no form at all, so this comes before the page's shape.
    if (read.status === 'wrong-account') return { kind: 'wrong-account', user: read.user ?? '' };
    // No uploader means the page offers no extras to this member (not a membership).
    if (read.status === 'no-uploader') return { kind: 'unavailable' };
    if (read.status !== 'ok') return { kind: 'failed' };
    return {
      kind: 'ok',
      items: read.items ?? [],
      remaining: typeof read.remaining === 'number' ? read.remaining : null,
    };
  } catch {
    return { kind: 'failed' };
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
  account: SiteAccount,
): Promise<{ kind: 'ok'; extras: EntryExtra[] } | { kind: 'needs-login' } | { kind: 'failed' }> {
  if (!siteSessionAvailable()) return { kind: 'failed' };
  try {
    const { result } = await siteRunPage({
      accountId: account.id,
      url: entryPageUrl(entryId),
      script: buildPageHtmlScript(account.username),
      timeoutMs: 45_000,
      waitForNavigation: false,
    });
    const page = parse<PageHtmlResult>(result);
    if (page === null) return { kind: 'failed' };
    // Not signed in, or signed in as someone else: either way this account has no usable session,
    // and nothing the other member can see is ever used.
    if (page.status === 'needs-login' || page.status === 'wrong-account') {
      return { kind: 'needs-login' };
    }
    if (typeof page.html !== 'string') return { kind: 'failed' };
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
export async function readExtrasRemaining(account: SiteAccount): Promise<number | null> {
  if (!siteSessionAvailable()) return null;
  try {
    const { result } = await siteRunPage({
      accountId: account.id,
      url: PUBLISH_URL,
      script: buildRemainingScript(account.username),
      timeoutMs: 30_000,
      waitForNavigation: false,
    });
    const read = parse<RemainingResult>(result);
    return read?.status === 'ok' && typeof read.remaining === 'number' ? read.remaining : null;
  } catch {
    return null;
  }
}
