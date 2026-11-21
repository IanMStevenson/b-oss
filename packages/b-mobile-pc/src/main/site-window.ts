// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { BrowserWindow, session } from 'electron';
import type { SitePageResult, SitePageRun } from '../shared/bridge.js';
import { isSignedInLanding, SITE_HOST } from './site-request.js';

// The member's own Blipfoto website session (b-oss#1037), used only to add extra photos. One
// persistent partition holds the site's cookie, so the member signs in once (signIn) and the hidden
// runPage windows reuse it. Nothing else in the shell uses this partition.
const PARTITION = 'persist:blipfoto-site';

const webPreferences = {
  partition: PARTITION,
  sandbox: true,
  contextIsolation: true,
  nodeIntegration: false,
  backgroundThrottling: false,
} as const;

/** Shows the site's sign-in page. Starts signed out (the stored site session is cleared first), so
 * a second account never mixes with the first. Resolves true as soon as the site sends the member
 * past /account/…, false if the window is closed first. Callers validate `url` (site-request.ts). */
export async function siteSignIn(parent: BrowserWindow | null, url: string): Promise<boolean> {
  await session
    .fromPartition(PARTITION)
    .clearStorageData({ storages: ['cookies', 'localstorage'] });
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 520,
      height: 760,
      parent: parent ?? undefined,
      modal: parent !== null,
      autoHideMenuBar: true,
      title: 'Sign in to Blipfoto',
      webPreferences,
    });
    let settled = false;
    const finish = (signedIn: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(signedIn);
      if (!win.isDestroyed()) win.close();
    };
    const check = (_event: unknown, target: string): void => {
      if (isSignedInLanding(target)) finish(true);
    };
    win.webContents.on('did-navigate', check);
    win.webContents.on('did-navigate-in-page', check);
    // A social sign-in opens a popup; allow https ones (they share this session) and nothing else.
    win.webContents.setWindowOpenHandler(({ url: target }) =>
      target.startsWith('https://') ? { action: 'allow' } : { action: 'deny' },
    );
    win.on('closed', () => finish(false));
    void win.loadURL(url).catch(() => finish(false));
  });
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Loads `run.url` in a hidden window with the site session, runs the script and polls its
 * window.__bmx until it reports or the timeout passes. With waitForNavigation it then holds the
 * window open until the page has navigated away (a form post), so the post is not cut off. */
export async function siteRunPage(run: SitePageRun): Promise<SitePageResult> {
  const win = new BrowserWindow({ show: false, webPreferences });
  const wc = win.webContents;
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Never leave the site: other hosts (and other schemes) are refused.
  wc.on('will-navigate', (event, target) => {
    if (new URL(target).host !== SITE_HOST) event.preventDefault();
  });
  const deadline = Date.now() + run.timeoutMs;
  try {
    await win.loadURL(run.url);
    await wc.executeJavaScript(run.script);
    let result: string | null = null;
    while (Date.now() < deadline && result === null) {
      await sleep(400);
      if (win.isDestroyed()) break;
      const value = (await wc.executeJavaScript(
        'window.__bmx === undefined ? null : window.__bmx',
      )) as string | null;
      if (typeof value === 'string' && value !== '') result = value;
    }
    if (result !== null && run.waitForNavigation && !win.isDestroyed()) {
      const startUrl = wc.getURL();
      while (Date.now() < deadline + 60_000) {
        await sleep(400);
        if (win.isDestroyed()) break;
        if (wc.getURL() !== startUrl && !wc.isLoading()) break;
      }
    }
    return { finalUrl: win.isDestroyed() ? '' : wc.getURL(), result };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}
