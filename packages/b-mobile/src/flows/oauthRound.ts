// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Runs one Blipfoto OAuth (implicit grant) authorization round (§8, auth.md). Not one screen's
// job in the sense that FLW-20's two-token sign-in runs this twice — SCR-01 orchestrates calling
// it, this module only knows how to run a single round correctly.
//
// A fresh `state` is generated per round and verified before the token is trusted (auth.md) — a
// redirect whose state is missing or doesn't match is discarded silently, not surfaced as an
// error, since it wasn't this app's sign-in. `GET oauth/token` then confirms the token was
// issued to this app and reads back its *granted* scope, which is what actually sets
// hasAppToken's read/write value — never the requested scope.

import {
  buildImplicitGrantUrl,
  parseImplicitGrantCallback,
  OAuthCallbackError,
} from '@b-oss/b-api';
import { openUrl, closeBrowser, onBrowserFinished } from '../platform/browser.js';
import { onAppUrlOpen } from '../platform/deepLinks.js';
import { getClientForToken } from '../data/client.js';

const REDIRECT_URI = import.meta.env.VITE_OAUTH_REDIRECT_URI ?? 'bmobile://oauth/';
const CLIENT_ID = import.meta.env.VITE_BLIPFOTO_CLIENT_ID ?? '';

export class OAuthCancelledError extends Error {
  constructor(reason: string) {
    super(`OAuth round cancelled: ${reason}`);
    this.name = 'OAuthCancelledError';
  }
}

export interface OAuthResult {
  accessToken: string;
  /** The scope Blipfoto actually granted, confirmed via GET oauth/token — not the requested
   * scope. Falls back to the requested scope only if the server doesn't echo one back. */
  grantedScope: 'read' | 'read,write';
  /** GET oauth/token always returns this, so it's present even when the redirect itself didn't
   * echo one back. */
  username: string;
}

function generateState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Runs a single OAuth round for the given scope. Resolves with the verified token, or rejects
 * with OAuthCancelledError (declined, closed without completing, or a state mismatch) or the
 * underlying error otherwise. */
export function runOAuthRound(scope: 'read' | 'read,write'): Promise<OAuthResult> {
  return new Promise((resolve, reject) => {
    const state = generateState();
    const url = buildImplicitGrantUrl({
      clientId: CLIENT_ID,
      redirectUri: REDIRECT_URI,
      scope,
      state,
    });

    let settled = false;
    const removeUrlListener = onAppUrlOpen(handleUrl);
    const removeFinishedListener = onBrowserFinished(() => {
      settle(() => reject(new OAuthCancelledError('browser closed')));
    });

    void openUrl(url);

    function settle(effect: () => void): void {
      if (settled) return;
      settled = true;
      removeUrlListener();
      removeFinishedListener();
      effect();
    }

    function handleUrl(incomingUrl: string): void {
      if (!incomingUrl.startsWith(REDIRECT_URI)) return;
      settle(() => {
        void closeBrowser();
        void finishRound(incomingUrl, state, scope).then(resolve, reject);
      });
    }
  });
}

async function finishRound(
  incomingUrl: string,
  expectedState: string,
  requestedScope: 'read' | 'read,write',
): Promise<OAuthResult> {
  let parsed: ReturnType<typeof parseImplicitGrantCallback>;
  try {
    parsed = parseImplicitGrantCallback(incomingUrl);
  } catch (err) {
    if (err instanceof OAuthCallbackError && err.isAccessDenied) {
      throw new OAuthCancelledError('declined');
    }
    throw err;
  }

  if (parsed.state !== expectedState) {
    // A mismatched/forged redirect is discarded silently — it wasn't this app's sign-in.
    throw new OAuthCancelledError('state mismatch');
  }

  const verifyClient = getClientForToken(parsed.accessToken);
  const verified = await verifyClient.verifyToken(CLIENT_ID);
  const grantedScope =
    verified.scope === 'read' || verified.scope === 'read,write' ? verified.scope : requestedScope;

  return {
    accessToken: parsed.accessToken,
    grantedScope,
    username: parsed.username ?? verified.username,
  };
}
