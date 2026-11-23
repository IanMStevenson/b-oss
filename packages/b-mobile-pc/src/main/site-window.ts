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

/** Deletes the stored site session, so nothing is left once the member disconnects the account. */
export async function siteSignOut(): Promise<void> {
  await session.fromPartition(PARTITION).clearStorageData();
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Loads `run.url` in a hidden window with the site session, runs the script and polls its
 * window.__bmx until it reports or the timeout passes. With waitForNavigation it then holds the
 * window open until the page has navigated away (a form post), so the post is not cut off.
 *
 * The script starts at `dom-ready`, not at the page's `load` event: the site's pages pull in
 * third-party scripts and images, and a slow or blocked one would otherwise hold `load` up for as
 * long as it likes (the script waits for the page's own uploader itself). Everything is bounded by
 * `run.timeoutMs`, and a run that times out or throws is written to the app log. */
async function runPage(run: SitePageRun, log: (message: string) => void): Promise<SitePageResult> {
  const started = Date.now();
  const where = new URL(run.url).pathname.replace(/\d{6,}/g, '<id>');
  const win = new BrowserWindow({ show: false, webPreferences });
  const wc = win.webContents;
  // A page's "leave this page?" prompt must never keep the window (and so the next run) waiting.
  wc.on('will-prevent-unload', (event) => event.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Never leave the site: other hosts (and other schemes) are refused.
  wc.on('will-navigate', (event, target) => {
    if (new URL(target).host !== SITE_HOST) event.preventDefault();
  });
  const deadline = started + run.timeoutMs;
  try {
    // Not awaited: it settles at `load`, which this does not wait for. Aborted loads (a redirect
    // mid-flight) reject, which is not an error here.
    void win.loadURL(run.url).catch(() => {});
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('page did not become ready')), run.timeoutMs);
      wc.once('dom-ready', () => {
        clearTimeout(timer);
        resolve();
      });
    });
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
    if (result === null) log(`site page ${where}: no result after ${Date.now() - started} ms`);
    return { finalUrl: win.isDestroyed() ? '' : wc.getURL(), result };
  } catch (err) {
    log(
      `site page ${where}: ${err instanceof Error ? err.message : String(err)} after ${Date.now() - started} ms`,
    );
    throw err;
  } finally {
    await closeWindow(win);
  }
}

/** Closes a hidden window gracefully and waits for it to be gone. `destroy()` is not used: in a real
 * Electron, a window destroyed like that leaves the next window on the same session failing to load
 * its page at once (ERR_FAILED), which showed as the edit screen's extras never appearing. */
function closeWindow(win: BrowserWindow): Promise<void> {
  return new Promise((resolve) => {
    if (win.isDestroyed()) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, 3_000);
    win.once('closed', () => {
      clearTimeout(timer);
      resolve();
    });
    win.close();
  });
}

// One page run at a time: they share one session, and two overlapping ones have no use here.
let queue: Promise<unknown> = Promise.resolve();

export function siteRunPage(
  run: SitePageRun,
  log: (message: string) => void = () => {},
): Promise<SitePageResult> {
  const next = queue.then(() => runPage(run, log));
  queue = next.catch(() => undefined);
  return next;
}
