// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Who may use the website session when a device keeps only ONE of them (b-oss#1050).
// `capabilities().site.session` says which: 'per-account' (each account has its own, nothing to
// decide) or 'single' (a WebView without separate profiles: one session for the whole app).
// With a single session exactly one account is the designated "extras account"; an extras action
// from any other account asks first, and switching signs the website out so the next sign-in is
// the new account's. The page scripts independently refuse a page signed in as anyone but the
// selected member, so this is about a clear experience, not the only safeguard.

import { capabilities } from '../platform/capabilities.js';
import { deletePref, getPref, setPref } from '../platform/prefs.js';

const KEY = 'b-mobile:extras-account';

export type SiteAccess = { kind: 'ready' } | { kind: 'owned-by'; accountId: string };

/** The account the single website session is set up for, or null when none is yet. */
export function designatedExtrasAccount(): Promise<string | null> {
  return getPref(KEY);
}

export function setDesignatedExtrasAccount(accountId: string): Promise<void> {
  return setPref(KEY, accountId);
}

/** Forgets the designation if it is this account (it is being removed, or has been signed out). */
export async function clearDesignatedExtrasAccount(accountId: string): Promise<void> {
  if ((await getPref(KEY)) === accountId) await deletePref(KEY);
}

/** Whether this account may use the website session now. */
export async function siteAccessFor(accountId: string): Promise<SiteAccess> {
  if (capabilities().site.session !== 'single') return { kind: 'ready' };
  const owner = await designatedExtrasAccount();
  return owner === null || owner === accountId
    ? { kind: 'ready' }
    : { kind: 'owned-by', accountId: owner };
}

/** Records that this account now holds the website session, where sessions are shared. */
export async function claimSiteSession(accountId: string): Promise<void> {
  if (capabilities().site.session === 'single') await setDesignatedExtrasAccount(accountId);
}
