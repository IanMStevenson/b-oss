// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The member's own Blipfoto website session, used to add, edit and read extra photos (b-oss#1037,
// b-oss#1050). This file is the ONE place that picks the platform's implementation of the
// SiteSessionHost contract (site/contract.ts): the desktop shell's `site` bridge, or the local
// SiteSession Capacitor plugin on Android (android/app/.../SiteSessionPlugin.java, not an npm
// package) and iOS later. Everything else calls the functions below and reads
// `capabilities().site.session`; nothing else asks which platform it is.

import { registerPlugin } from '@capacitor/core';
import type { SitePageResult, SitePageRun, SiteSessionHost } from '../site/contract.js';
import { capabilities, recordSiteSessionIsolation } from './capabilities.js';
import { desktopBridge } from './desktop.js';
import { platformKind } from './platformKind.js';

export type { SitePageResult, SitePageRun, SiteSessionHost };

interface SiteSessionPlugin {
  isolation(): Promise<{ isolation: 'per-account' | 'single' }>;
  signIn(options: { url: string; accountId: string }): Promise<{ signedIn: boolean }>;
  signOut(options: { accountId: string }): Promise<void>;
  runPage(options: SitePageRun): Promise<SitePageResult>;
  adoptPending(options: { token: string; accountId: string }): Promise<void>;
  discardPending(options: { token: string }): Promise<void>;
  discardAllPending(): Promise<void>;
}

const SiteSession = registerPlugin<SiteSessionPlugin>('SiteSession');

const capacitorHost: SiteSessionHost = {
  signIn: async (accountId, url) => (await SiteSession.signIn({ url, accountId })).signedIn,
  signOut: (accountId) => SiteSession.signOut({ accountId }),
  runPage: (run) => SiteSession.runPage(run),
  adoptPending: (token, accountId) => SiteSession.adoptPending({ token, accountId }),
  discardPending: (token) => SiteSession.discardPending({ token }),
};

/** The platform's host, or null where there is none (a plain browser, or a desktop shell too old
 * to have the `site` bridge). */
function host(): SiteSessionHost | null {
  switch (platformKind()) {
    case 'desktop':
      return desktopBridge()?.site ?? null;
    case 'android':
    case 'ios':
      return capacitorHost;
    case 'web':
      return null;
  }
}

export class SiteSessionUnavailableError extends Error {
  constructor() {
    super('The website session is not available on this device');
    this.name = 'SiteSessionUnavailableError';
  }
}

function required(): SiteSessionHost {
  const h = host();
  if (h === null) throw new SiteSessionUnavailableError();
  return h;
}

/** Whether this device can run the website flows at all. */
export function siteSessionAvailable(): boolean {
  return capabilities().site.session !== 'none' && host() !== null;
}

/** Shows the site's sign-in page for this account; true once the member has signed in. Always
 * starts signed out, so one member's sign-in is never mixed with another's. */
export function siteSignIn(accountId: string, url: string): Promise<boolean> {
  return required().signIn(accountId, url);
}

/** Deletes this account's website session. Quiet where there is nothing to delete. */
export async function siteSignOut(accountId: string): Promise<void> {
  await host()?.signOut(accountId);
}

/** Loads `run.url` in a hidden page with the account's session and runs the script. */
export function siteRunPage(run: SitePageRun): Promise<SitePageResult> {
  return required().runPage(run);
}

/** A fresh name for the website login one sign-in round leaves behind (b-oss#1064): hex, unguessable,
 * used once. Pass it to `openEmbeddedAuth`, then to `siteAdoptPending` or `siteDiscardPending`. */
export function newSiteSessionToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Makes the website login a sign-in round left under `token` the account's session, replacing what
 * it had (b-oss#1064). Never throws: the account is signed in either way, and the worst case is the
 * member being asked to sign in to the website when they first need it. */
export async function siteAdoptPending(token: string, accountId: string): Promise<void> {
  try {
    await host()?.adoptPending(token, accountId);
  } catch {
    // Falls back to the explicit website sign-in (components/useSiteSignInGate.tsx).
  }
}

/** Forgets what a sign-in round left under `token`. Never throws. */
export async function siteDiscardPending(token: string): Promise<void> {
  try {
    await host()?.discardPending(token);
  } catch {
    // Nothing to do: the host also sweeps leftovers at start-up.
  }
}

/** Asks a native host whether it can keep a website session per account (Android WebView profiles;
 * iOS per-identifier data stores) and records the answer in `capabilities()`. Called once at start-up;
 * until it answers, the tabled value ('single': one shared session) applies. Never throws. */
export async function initSiteSession(): Promise<void> {
  const kind = platformKind();
  if (kind !== 'android' && kind !== 'ios') return;
  try {
    const { isolation } = await SiteSession.isolation();
    recordSiteSessionIsolation(isolation);
    // Anything a sign-in round left behind before the app last stopped belongs to no account.
    await SiteSession.discardAllPending().catch(() => {});
  } catch {
    // An older native shell has no such call: stay on the safe default, one shared session.
  }
}
