// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { BrowserWindow, session, shell, safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';

let pendingState: string | null = null;
let pendingResolve: ((token: string) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;

const CLIENT_ID = import.meta.env.MAIN_VITE_BLIPFOTO_CLIENT_ID;

function missingClientIdError(): Error {
  return new Error(
    'MAIN_VITE_BLIPFOTO_CLIENT_ID is not set. Add it to .env.local at the repo root. ' +
      'Register your app at https://www.blipfoto.com/developer/apps (distributed app, ' +
      'redirect URI b-ark://oauth/callback).',
  );
}

function buildAuthorizeUrl(state: string): string {
  const url = new URL('https://www.blipfoto.com/oauth/authorize');
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('client_id', CLIENT_ID as string);
  url.searchParams.set('redirect_uri', 'b-ark://oauth/callback');
  url.searchParams.set('scope', 'read');
  url.searchParams.set('state', state);
  return url.toString();
}

/**
 * Run the OAuth flow in the user's system default browser.
 * Returns when the OS dispatches the b-ark:// callback URI back to this app
 * (via `second-instance` / `open-url` → `handleOAuthCallback`).
 */
export function startOAuthFlow(): Promise<string> {
  if (!CLIENT_ID) return Promise.reject(missingClientIdError());

  return new Promise((resolve, reject) => {
    pendingState = randomUUID();
    pendingResolve = resolve;
    pendingReject = reject;
    void shell.openExternal(buildAuthorizeUrl(pendingState));
  });
}

/**
 * Run the OAuth flow inside an embedded Electron window with an ephemeral
 * session (no persisted cookies). Forces the Blipfoto login screen even if
 * the user is logged in elsewhere — useful for users with multiple accounts.
 */
export function startOAuthFlowEmbedded(parent: BrowserWindow | null): Promise<string> {
  if (!CLIENT_ID) return Promise.reject(missingClientIdError());

  return new Promise((resolve, reject) => {
    const state = randomUUID();

    // Disposable session — partition name is unique so cookies never persist
    // and never overlap with the main app session.
    const oauthSession = session.fromPartition(`oauth-fresh-${state}`);

    const win = new BrowserWindow({
      width: 520,
      height: 760,
      parent: parent ?? undefined,
      modal: parent !== null,
      autoHideMenuBar: true,
      title: 'Sign in to Blipfoto',
      webPreferences: {
        session: oauthSession,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    let settled = false;
    const finish = (ok: () => void, err?: Error): void => {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else ok();
      // Defer close so the redirect handler returns cleanly first.
      setImmediate(() => {
        if (!win.isDestroyed()) win.close();
      });
    };

    // Intercept the b-ark://oauth/callback redirect before Chromium tries
    // to navigate to it (which would fail with ERR_UNKNOWN_URL_SCHEME).
    // Filter URL patterns aren't accepted on this overload — match manually.
    oauthSession.webRequest.onBeforeRequest((details, callback) => {
      if (details.url.startsWith('b-ark://')) {
        try {
          const token = extractTokenFromCallback(details.url, state);
          finish(() => resolve(token));
        } catch (e) {
          finish(() => {}, e as Error);
        }
        callback({ cancel: true });
        return;
      }
      callback({});
    });

    win.on('closed', () => {
      finish(() => {}, new Error('OAuth window closed by user'));
    });

    void win.loadURL(buildAuthorizeUrl(state));
  });
}

function extractTokenFromCallback(uri: string, expectedState: string): string {
  const hashIndex = uri.indexOf('#');
  if (hashIndex === -1) throw new Error('No fragment in OAuth callback URI');
  const fragment = new URLSearchParams(uri.slice(hashIndex + 1));

  const returnedState = fragment.get('state');
  if (returnedState !== expectedState) {
    throw new Error('OAuth state mismatch — possible CSRF');
  }

  const accessToken = fragment.get('access_token');
  if (!accessToken) throw new Error('No access_token in OAuth callback');
  return accessToken;
}

export function handleOAuthCallback(uri: string): void {
  if (!pendingState || !pendingResolve || !pendingReject) return;
  try {
    pendingResolve(extractTokenFromCallback(uri, pendingState));
  } catch (err) {
    pendingReject(err as Error);
  } finally {
    pendingState = null;
    pendingResolve = null;
    pendingReject = null;
  }
}

export function encryptToken(token: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage encryption is not available on this platform');
  }
  return safeStorage.encryptString(token).toString('base64');
}

export function decryptToken(encrypted: string): string {
  return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
}
