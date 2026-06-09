// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { BrowserWindow, session, shell, safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import {
  buildImplicitGrantUrl,
  parseImplicitGrantCallback,
  OAuthCallbackError,
} from '@b-oss/b-api';

let pendingState: string | null = null;
let pendingResolve: ((token: string) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;

// Keyed by state UUID — handles embedded-window flows where the OS fires
// second-instance instead of letting Chromium navigate the b-ark:// URL.
const embeddedCallbackHandlers = new Map<string, (uri: string) => void>();

const CLIENT_ID = import.meta.env.MAIN_VITE_BLIPFOTO_CLIENT_ID;

function missingClientIdError(): Error {
  return new Error(
    'MAIN_VITE_BLIPFOTO_CLIENT_ID is not set. Add it to .env.local at the repo root. ' +
      'Register your app at https://www.blipfoto.com/developer/apps (distributed app, ' +
      'redirect URI b-ark://oauth/callback).',
  );
}

function buildAuthorizeUrl(state: string): string {
  // Blipfoto ignores scope on the implicit grant flow and always issues
  // read/write tokens regardless of what is requested here.
  return buildImplicitGrantUrl({
    clientId: CLIENT_ID as string,
    redirectUri: 'b-ark://oauth/callback',
    scope: 'read',
    state,
  });
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
      embeddedCallbackHandlers.delete(state);
      if (err) reject(err);
      else ok();
      // Defer close so the redirect handler returns cleanly first.
      setImmediate(() => {
        if (!win.isDestroyed()) win.close();
      });
    };

    // On Windows the OS protocol handler fires second-instance rather than
    // letting Chromium navigate the b-ark:// URL within the embedded session.
    // Register a handler keyed by state so second-instance can route it here.
    embeddedCallbackHandlers.set(state, (uri: string) => {
      try {
        finish(() => resolve(extractTokenFromCallback(uri, state)));
      } catch (e) {
        finish(() => {}, e as Error);
      }
    });

    // Also intercept within the session for platforms where Chromium does
    // attempt to navigate the custom-scheme URL before the OS handles it.
    oauthSession.webRequest.onBeforeRequest((details, callback) => {
      if (details.url.startsWith('b-ark://')) {
        try {
          finish(() => resolve(extractTokenFromCallback(details.url, state)));
        } catch (e) {
          finish(() => {}, e as Error);
        }
        callback({ cancel: true });
        return;
      }
      callback({});
    });

    win.on('closed', () => {
      finish(() => {}, new OAuthCancelledError('Sign-in window closed'));
    });

    void win.loadURL(buildAuthorizeUrl(state));
  });
}

/**
 * Class name (`error.name`) used to signal user-driven cancellation across IPC.
 * Electron's ipcMain.handle preserves the Error's `name` field on the renderer
 * side, so the renderer can detect cancellations reliably without relying on
 * message-text matching.
 */
export const OAUTH_CANCELLED_NAME = 'OAuthCancelledError';

export class OAuthCancelledError extends Error {
  constructor(message = 'Sign-in cancelled') {
    super(message);
    this.name = OAUTH_CANCELLED_NAME;
  }
}

function extractTokenFromCallback(uri: string, expectedState: string): string {
  let result: { accessToken: string; state: string };
  try {
    result = parseImplicitGrantCallback(uri);
  } catch (e) {
    if (e instanceof OAuthCallbackError && e.isAccessDenied) throw new OAuthCancelledError();
    throw e;
  }
  if (result.state !== expectedState) throw new Error('OAuth state mismatch — possible CSRF');
  return result.accessToken;
}

export function handleOAuthCallback(uri: string): void {
  // Extract state from the callback URI to route to the correct handler.
  const queryIndex = uri.indexOf('?');
  const hashIndex = uri.indexOf('#');
  const query =
    queryIndex !== -1
      ? new URLSearchParams(uri.slice(queryIndex + 1, hashIndex === -1 ? undefined : hashIndex))
      : new URLSearchParams();
  const fragment =
    hashIndex !== -1 ? new URLSearchParams(uri.slice(hashIndex + 1)) : new URLSearchParams();
  const state = fragment.get('state') ?? query.get('state');

  if (state !== null) {
    const embedded = embeddedCallbackHandlers.get(state);
    if (embedded) {
      embedded(uri);
      return;
    }
  }

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
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage encryption is not available — cannot decrypt access token');
  }
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  } catch {
    throw new Error('Failed to decrypt access token — re-authorise this account in setttings');
  }
}
