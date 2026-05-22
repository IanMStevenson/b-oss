// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { shell, safeStorage } from 'electron';
import { randomUUID } from 'node:crypto';

let pendingState: string | null = null;
let pendingResolve: ((token: string) => void) | null = null;
let pendingReject: ((err: Error) => void) | null = null;

const CLIENT_ID = import.meta.env.MAIN_VITE_BLIPFOTO_CLIENT_ID;

export function startOAuthFlow(): Promise<string> {
  if (!CLIENT_ID) {
    return Promise.reject(
      new Error(
        'MAIN_VITE_BLIPFOTO_CLIENT_ID is not set. Add it to .env.local at the repo root. ' +
          'Register your app at https://www.blipfoto.com/developer/apps (distributed app, ' +
          'redirect URI b-ark://oauth/callback).',
      ),
    );
  }

  return new Promise((resolve, reject) => {
    pendingState = randomUUID();
    pendingResolve = resolve;
    pendingReject = reject;

    const url = new URL('https://www.blipfoto.com/oauth/authorize');
    url.searchParams.set('response_type', 'token');
    url.searchParams.set('client_id', CLIENT_ID);
    url.searchParams.set('redirect_uri', 'b-ark://oauth/callback');
    url.searchParams.set('scope', 'read');
    url.searchParams.set('state', pendingState);

    void shell.openExternal(url.toString());
  });
}

export function handleOAuthCallback(uri: string): void {
  try {
    const hashIndex = uri.indexOf('#');
    if (hashIndex === -1) throw new Error('No fragment in OAuth callback URI');
    const fragment = new URLSearchParams(uri.slice(hashIndex + 1));

    const returnedState = fragment.get('state');
    if (returnedState !== pendingState) {
      throw new Error('OAuth state mismatch — possible CSRF');
    }

    const accessToken = fragment.get('access_token');
    if (!accessToken) throw new Error('No access_token in OAuth callback');

    pendingResolve?.(accessToken);
  } catch (err) {
    pendingReject?.(err as Error);
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
