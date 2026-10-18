// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Per-account authenticated blipfoto.com website session, used by the backup
// engine to fetch original-size / hires / extra images the JSON API withholds
// from distributed apps.
//
// Storage model (see UserDataStore.web_sessions): the interactive sign-in runs
// in an *ephemeral* partition so no cookie ever hits disk unencrypted; on
// success the cookies are serialised, safeStorage-encrypted, and kept in
// electron-store — the same at-rest posture as OAuth tokens. Each backup run
// decrypts that blob into a fresh ephemeral run-partition and, afterwards,
// re-snapshots it to capture server-side rotation / sliding "remember me"
// expiry.

import { BrowserWindow, session, shell, type Session } from 'electron';
import { randomUUID } from 'node:crypto';
import { getWebSessionBlob, setWebSessionBlob, deleteWebSessionBlob } from './store.js';
import { encryptSecret, decryptSecret } from './secret-store.js';
import {
  BLIPFOTO_COOKIE_DOMAIN,
  BLIPFOTO_LOGIN_URL,
  classifyScrapeResponse,
  cookieSetUrl,
  deserializeCookies,
  isLoginUrl,
  isSignedInFromCookies,
  serializeCookies,
  type WebCookie,
} from './web-session-pure.js';

// Blipfoto is a plain Apache/PHP stack (no Cloudflare), so `Session.fetch`'s
// `Electron/<ver>` UA token is not expected to matter. Flip to true if a WAF
// ever starts caring — see the plan's Step 0.
const STRIP_ELECTRON_UA = false;

const LOGIN_PARTITION_PREFIX = 'blipfoto-web-login-';
const RUN_PARTITION_PREFIX = 'blipfoto-web-run-';

/** Open interactive sign-in windows, keyed by account id (re-entry guard). */
const openLoginWindows = new Map<string, BrowserWindow>();

function stripUaIfNeeded(sess: Session): void {
  if (!STRIP_ELECTRON_UA) return;
  sess.setUserAgent(sess.getUserAgent().replace(/ Electron\/[^ ]+/, ''));
}

function toWebCookies(cookies: Electron.Cookie[]): WebCookie[] {
  return cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain ?? BLIPFOTO_COOKIE_DOMAIN,
    path: c.path ?? '/',
    secure: c.secure ?? false,
    httpOnly: c.httpOnly ?? false,
    expirationDate: c.session ? undefined : c.expirationDate,
    sameSite: c.sameSite,
  }));
}

async function readBlipfotoCookies(sess: Session): Promise<WebCookie[]> {
  const raw = await sess.cookies.get({ domain: BLIPFOTO_COOKIE_DOMAIN });
  return toWebCookies(raw);
}

function persistCookies(accountId: string, cookies: WebCookie[]): void {
  setWebSessionBlob(accountId, encryptSecret(serializeCookies(cookies)));
}

/**
 * Open a modal window for the user to sign in to blipfoto.com. Resolves to the
 * resulting signed-in state; never rejects on cancellation — closing the window
 * (whether mid-sign-in or after finishing) resolves with whatever the cookie
 * jar shows at that point.
 */
export function openWebLoginWindow(
  accountId: string,
  parent: BrowserWindow | null,
): Promise<boolean> {
  const already = openLoginWindows.get(accountId);
  if (already && !already.isDestroyed()) {
    already.focus();
    return Promise.resolve(deriveSignedInSync(accountId));
  }

  return new Promise<boolean>((resolve) => {
    // Ephemeral partition — unique name, no `persist:` prefix, so nothing is
    // written to disk. We lift the cookies out ourselves on success.
    const loginSession = session.fromPartition(`${LOGIN_PARTITION_PREFIX}${accountId}-${randomUUID()}`);
    stripUaIfNeeded(loginSession);

    const win = new BrowserWindow({
      width: 520,
      height: 760,
      parent: parent ?? undefined,
      modal: parent !== null,
      autoHideMenuBar: true,
      title: 'Sign in to Blipfoto',
      webPreferences: {
        session: loginSession,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    openLoginWindows.set(accountId, win);

    let settled = false;
    let poll: ReturnType<typeof setInterval> | null = null;

    const finish = (signedIn: boolean): void => {
      if (settled) return;
      settled = true;
      if (poll) clearInterval(poll);
      openLoginWindows.delete(accountId);
      resolve(signedIn);
      setImmediate(() => {
        if (!win.isDestroyed()) win.close();
      });
    };

    const checkSignedIn = async (): Promise<void> => {
      if (settled || win.isDestroyed()) return;
      let cookies: WebCookie[];
      try {
        cookies = await readBlipfotoCookies(loginSession);
      } catch {
        return;
      }
      const currentUrl = win.isDestroyed() ? '' : win.webContents.getURL();
      if (isSignedInFromCookies(cookies) && !isLoginUrl(currentUrl)) {
        persistCookies(accountId, cookies);
        finish(true);
      }
    };

    win.webContents.on('did-navigate', () => void checkSignedIn());
    win.webContents.on('did-redirect-navigation', () => void checkSignedIn());
    // Belt-and-braces: the cookie can land without a top-level navigation.
    poll = setInterval(() => void checkSignedIn(), 1000);

    // Keep external links (e.g. federated IdP popups) in the system browser.
    win.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url);
      return { action: 'deny' };
    });

    win.on('closed', () => {
      if (settled) return;
      // One last look — the user may have finished signing in and then just
      // closed the window before the poll caught it.
      readBlipfotoCookies(loginSession)
        .then((cookies) => {
          const signedIn = isSignedInFromCookies(cookies);
          if (signedIn) persistCookies(accountId, cookies);
          finish(signedIn);
        })
        .catch(() => finish(false));
    });

    void win.loadURL(BLIPFOTO_LOGIN_URL);
  });
}

function deriveSignedInSync(accountId: string): boolean {
  const blob = getWebSessionBlob(accountId);
  if (!blob) return false;
  try {
    return isSignedInFromCookies(deserializeCookies(decryptSecret(blob)));
  } catch {
    return false;
  }
}

function cookieSetDetails(c: WebCookie): Electron.CookiesSetDetails {
  const details: Electron.CookiesSetDetails = {
    url: cookieSetUrl(c),
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
  };
  if (c.expirationDate !== undefined) details.expirationDate = c.expirationDate;
  // Chromium rejects SameSite=None without Secure; only forward a value we know
  // is safe, otherwise let it default.
  if (c.sameSite === 'lax' || c.sameSite === 'strict') details.sameSite = c.sameSite;
  else if (c.sameSite === 'no_restriction' && c.secure) details.sameSite = c.sameSite;
  return details;
}

/**
 * Decrypt the stored session for an account and hydrate it into a fresh
 * ephemeral run-partition. Returns `null` when there is no stored session or
 * its cookies have expired — the caller then backs up API-only.
 */
export async function loadRunSession(accountId: string): Promise<Session | null> {
  const blob = getWebSessionBlob(accountId);
  if (!blob) return null;

  let cookies: WebCookie[];
  try {
    cookies = deserializeCookies(decryptSecret(blob));
  } catch {
    return null;
  }
  if (!isSignedInFromCookies(cookies)) return null;

  const sess = session.fromPartition(`${RUN_PARTITION_PREFIX}${accountId}`);
  stripUaIfNeeded(sess);
  await sess.clearStorageData({ storages: ['cookies'] });
  await Promise.all(
    cookies.map((c) =>
      sess.cookies.set(cookieSetDetails(c)).catch(() => {
        /* a single un-settable cookie shouldn't sink the whole session */
      }),
    ),
  );
  return sess;
}

/**
 * Re-read the run-partition's cookies after a backup and persist them, so a
 * rotated / refreshed session cookie survives to the next run. No-op if the
 * session no longer looks signed in (that state is handled by the caller).
 */
export async function snapshotRunSession(accountId: string, sess: Session): Promise<void> {
  try {
    const cookies = await readBlipfotoCookies(sess);
    if (isSignedInFromCookies(cookies)) {
      persistCookies(accountId, cookies);
    }
  } catch {
    /* best-effort */
  }
}

/** Forget an account's website session entirely (sign out / account removal). */
export async function clearWebSession(accountId: string): Promise<void> {
  const win = openLoginWindows.get(accountId);
  if (win && !win.isDestroyed()) win.destroy();
  openLoginWindows.delete(accountId);
  deleteWebSessionBlob(accountId);
  try {
    await session.fromPartition(`${RUN_PARTITION_PREFIX}${accountId}`).clearStorageData();
  } catch {
    /* partition may never have been materialised */
  }
}

/**
 * Fallback HTML fetch that renders the page in a hidden window on the given
 * session, for the (not currently expected) case where a plain `Session.fetch`
 * is challenged. One window, reused sequentially per run.
 */
let fallbackWindow: BrowserWindow | null = null;

export async function fetchHtmlViaWindow(sess: Session, url: string): Promise<string> {
  if (!fallbackWindow || fallbackWindow.isDestroyed()) {
    fallbackWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        session: sess,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        images: false,
      },
    });
  }
  const win = fallbackWindow;
  try {
    await win.loadURL(url);
  } catch (err) {
    // A client-side redirect during load rejects with ERR_ABORTED (-3); the
    // window still holds the destination page, so press on and read it.
    if ((err as { code?: string }).code !== 'ERR_ABORTED') throw err;
  }
  // Small settle for any client-side redirect/hydration.
  await new Promise((r) => setTimeout(r, 400));
  const finalUrl = win.webContents.getURL();
  const body = (await win.webContents.executeJavaScript(
    'document.documentElement.outerHTML',
  )) as string;
  if (classifyScrapeResponse({ status: 200, finalUrl, body }) === 'expired') {
    throw new Error('blipfoto.com web session expired');
  }
  return body;
}

export function disposeFallbackWindow(): void {
  if (fallbackWindow && !fallbackWindow.isDestroyed()) fallbackWindow.destroy();
  fallbackWindow = null;
}
