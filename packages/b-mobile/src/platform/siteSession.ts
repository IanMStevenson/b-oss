// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The member's own Blipfoto website session, used only to add extra photos (b-oss#1037). Wraps the
// local SiteSessionPlugin on Android (android/app/.../SiteSessionPlugin.java, not an npm package)
// and the desktop shell's `site` bridge. Two operations, both against www.blipfoto.com only:
//   - signIn: a visible window on the site's own sign-in page. The sign-in happens on Blipfoto and
//     nothing here sees the password; the cookie stays in the WebView/window's own store.
//   - runPage: a hidden window that loads one page of the signed-in site and runs a script in it
//     (platform/siteExtrasScripts.ts), reporting back through window.__bmx.
// Off-native and off-desktop (a plain browser) there is no implementation and both reject.

import { registerPlugin } from '@capacitor/core';
import { desktopBridge } from './desktop.js';
import { isCapacitorNative } from './platformKind.js';

export interface SitePageRun {
  /** An https://www.blipfoto.com/ page; the hosts refuse anything else. */
  url: string;
  /** Run once the page has loaded; sets window.__bmx to a JSON string when finished. */
  script: string;
  timeoutMs: number;
  /** After the script reports, keep the window open until the page navigates (a form post). */
  waitForNavigation: boolean;
}

export interface SitePageResult {
  /** Where the window ended up (after a redirect or a form post). */
  finalUrl: string;
  /** The script's window.__bmx, or null if it never reported before the timeout. */
  result: string | null;
}

interface SiteSessionPlugin {
  signIn(options: { url: string }): Promise<{ signedIn: boolean }>;
  signOut(): Promise<void>;
  runPage(options: SitePageRun): Promise<SitePageResult>;
}

const SiteSession = registerPlugin<SiteSessionPlugin>('SiteSession');

export class SiteSessionUnavailableError extends Error {
  constructor() {
    super('The website session is only available on Android and the desktop app');
    this.name = 'SiteSessionUnavailableError';
  }
}

/** Whether this host can run the site flows at all (Android, or a desktop shell new enough). */
export function siteSessionAvailable(): boolean {
  const desktop = desktopBridge();
  if (desktop) return desktop.site !== undefined;
  return isCapacitorNative();
}

/** Shows the site's sign-in page and resolves true once the member has signed in, false if they
 * closed it first. Always starts signed out, so a second account is never mixed with the first. */
export async function siteSignIn(url: string): Promise<boolean> {
  const desktop = desktopBridge();
  if (desktop?.site) return desktop.site.signIn(url);
  if (!desktop && isCapacitorNative()) return (await SiteSession.signIn({ url })).signedIn;
  throw new SiteSessionUnavailableError();
}

/** Loads `run.url` in a hidden window with the stored site session and runs the script. */
export async function siteRunPage(run: SitePageRun): Promise<SitePageResult> {
  const desktop = desktopBridge();
  if (desktop?.site) return desktop.site.runPage(run);
  if (!desktop && isCapacitorNative()) return SiteSession.runPage(run);
  throw new SiteSessionUnavailableError();
}

/** Deletes the stored website session (its cookies), so nothing is left behind when the member
 * disconnects their account. Resolves quietly where there is nothing to delete. */
export async function siteSignOut(): Promise<void> {
  const desktop = desktopBridge();
  if (desktop?.site) return desktop.site.signOut();
  if (!desktop && isCapacitorNative()) await SiteSession.signOut();
}
