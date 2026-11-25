// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { BrowserWindow, session } from 'electron';
import type { SitePageResult, SitePageRun } from '../shared/bridge.js';
import { isSignedInLanding, partitionFor, pendingPartitionFor, SITE_HOST } from './site-request.js';

// The member's own Blipfoto website session (b-oss#1037), used only to add, edit and read extra
// photos. Each b-mobile account has a session of its own (a persistent partition named for it), so
// the site's cookie for one member can never be used while another is selected; the member signs in
// once per account (signIn) and the hidden runPage windows reuse that account's session. Nothing
// else in the shell uses these partitions.
const LEGACY_PARTITION = 'persist:blipfoto-site';

function webPreferencesFor(accountId: string) {
  return {
    partition: partitionFor(accountId),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    backgroundThrottling: false,
  } as const;
}

/** Deletes the one shared session earlier builds kept for every account, which could belong to
 * anyone. Called once at start-up; best effort. */
export async function clearLegacySiteSession(): Promise<void> {
  await session.fromPartition(LEGACY_PARTITION).clearStorageData();
}

/** Shows the site's sign-in page. Starts signed out (the stored site session is cleared first), so
 * a second account never mixes with the first. Resolves true as soon as the site sends the member
 * past /account/…, false if the window is closed first. Callers validate `url` (site-request.ts). */
export async function siteSignIn(
  parent: BrowserWindow | null,
  accountId: string,
  url: string,
  host: string = SITE_HOST,
): Promise<boolean> {
  await session
    .fromPartition(partitionFor(accountId))
    .clearStorageData({ storages: ['cookies', 'localstorage'] });
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      width: 520,
      height: 760,
      parent: parent ?? undefined,
      modal: parent !== null,
      autoHideMenuBar: true,
      title: 'Sign in to Blipfoto',
      webPreferences: webPreferencesFor(accountId),
    });
    let settled = false;
    const finish = (signedIn: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(signedIn);
      if (!win.isDestroyed()) win.close();
    };
    const check = (_event: unknown, target: string): void => {
      if (isSignedInLanding(target, host)) finish(true);
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

/** Whether a cookie set for `domain` is one the site `host` receives. */
function cookieIsFor(domain: string | undefined, host: string): boolean {
  const d = (domain ?? '').replace(/^\./, '');
  return d !== '' && (host === d || host.endsWith(`.${d}`));
}

/** Makes the website login a sign-in round left under `token` the account's own session
 * (b-oss#1064): the round's cookies for the site are copied inside the main process (none reaches
 * JavaScript), replacing whatever the account had, and what the round kept is then forgotten. Quiet
 * when the round left nothing. */
export async function siteAdoptPending(
  token: string,
  accountId: string,
  host: string = SITE_HOST,
): Promise<void> {
  const pending = session.fromPartition(pendingPartitionFor(token));
  const target = session.fromPartition(partitionFor(accountId));
  const cookies = (await pending.cookies.get({})).filter((c) => cookieIsFor(c.domain, host));
  if (cookies.length > 0) {
    await target.clearStorageData({ storages: ['cookies', 'localstorage'] });
    for (const c of cookies) {
      const domain = (c.domain ?? host).replace(/^\./, '');
      await target.cookies.set({
        url: `${c.secure ? 'https' : 'http'}://${domain}${c.path ?? '/'}`,
        name: c.name,
        value: c.value,
        // A host-only cookie must stay host-only: only a cookie that had a domain gets one.
        ...(c.hostOnly ? {} : { domain: c.domain }),
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        ...(c.expirationDate === undefined ? {} : { expirationDate: c.expirationDate }),
        sameSite: c.sameSite,
      });
    }
    await target.cookies.flushStore();
  }
  await siteDiscardPending(token);
}

/** Forgets what a sign-in round left under `token`. */
export async function siteDiscardPending(token: string): Promise<void> {
  await session.fromPartition(pendingPartitionFor(token)).clearStorageData();
}

/** Deletes the account's stored site session, so nothing is left once the member disconnects it. */
export async function siteSignOut(accountId: string): Promise<void> {
  await session.fromPartition(partitionFor(accountId)).clearStorageData();
}

/** How long to wait, after a script reports, for the page to navigate (a form post and the page it
 * lands on). */
const NAVIGATION_WAIT_MS = 30_000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Loads `run.url` in a hidden window with the site session, runs the script and polls its
 * window.__bmx until it reports or the timeout passes. With waitForNavigation it then holds the
 * window open until the page has navigated away (a form post), so the post is not cut off.
 *
 * The script starts at `dom-ready`, not at the page's `load` event: the site's pages pull in
 * third-party scripts and images, and a slow or blocked one would otherwise hold `load` up for as
 * long as it likes (the script waits for the page's own uploader itself). Everything is bounded by
 * `run.timeoutMs`, and a run that times out or throws is written to the app log. */
async function runPage(
  run: SitePageRun,
  log: (message: string) => void,
  host: string,
): Promise<SitePageResult> {
  const started = Date.now();
  const where = new URL(run.url).pathname.replace(/\d{6,}/g, '<id>');
  const win = new BrowserWindow({ show: false, webPreferences: webPreferencesFor(run.accountId) });
  const wc = win.webContents;
  // A page's "leave this page?" prompt must never keep the window (and so the next run) waiting.
  wc.on('will-prevent-unload', (event) => event.preventDefault());
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Never leave the site: other hosts (and other schemes) are refused.
  wc.on('will-navigate', (event, target) => {
    if (new URL(target).host !== host) event.preventDefault();
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
      // A form post navigates within a few seconds; a script that reported a failure never will,
      // so the wait is short and its own, not the run's remaining time.
      const startUrl = wc.getURL();
      const navigationDeadline = Date.now() + NAVIGATION_WAIT_MS;
      while (Date.now() < navigationDeadline) {
        await sleep(400);
        if (win.isDestroyed()) break;
        if (wc.getURL() !== startUrl && !wc.isLoading()) break;
      }
    }
    if (result === null) {
      log(`site page ${where}: no result after ${Date.now() - started} ms`);
    } else {
      log(`site page ${where}: ${summarise(result)} (${Date.now() - started} ms)`);
    }
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

/** A short account of a page script's answer for the app log: its status, and the page detail it
 * gives when something was not as expected. Never the page's HTML. */
function summarise(result: string): string {
  try {
    const parsed = JSON.parse(result) as { status?: unknown; detail?: unknown; error?: unknown };
    const parts = [`status=${typeof parsed.status === 'string' ? parsed.status : '?'}`];
    if (parsed.error !== undefined)
      parts.push(`error=${JSON.stringify(parsed.error).slice(0, 200)}`);
    if (parsed.detail !== undefined)
      parts.push(`detail=${JSON.stringify(parsed.detail).slice(0, 400)}`);
    return parts.join(' ');
  } catch {
    return 'unreadable result';
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
  host: string = SITE_HOST,
): Promise<SitePageResult> {
  const next = queue.then(() => runPage(run, log, host));
  queue = next.catch(() => undefined);
  return next;
}
