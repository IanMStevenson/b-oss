// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// b-oss#330 item 1 — the system-browser OAuth round against hostile/forged redirects. Any app on
// the device can fire a VIEW intent at the manifest's bmobile:// filter, so what matters is that a
// redirect is never trusted unless its state matches, and that deepLinkResolver and the round
// agree on which URLs are the OAuth redirect (so the router never also navigates on one).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveDeepLink } from '../deepLinkResolver.js';

let urlHandler: ((url: string) => void) | null = null;
let browserFinished: (() => void) | null = null;
const removeUrl = vi.fn();
const openUrl = vi.fn<(url: string) => Promise<void>>().mockResolvedValue(undefined);
const closeBrowser = vi.fn<() => void>();
const verifyToken =
  vi.fn<(token: string, clientId: string) => Promise<{ scope: string; username: string }>>();

vi.mock('../../platform/browser.js', () => ({
  openUrl: (u: string) => openUrl(u),
  closeBrowser: () => closeBrowser(),
  onBrowserFinished: (cb: () => void) => {
    browserFinished = cb;
    return () => {
      browserFinished = null;
    };
  },
}));
vi.mock('../../platform/deepLinks.js', () => ({
  onAppUrlOpen: (cb: (url: string) => void) => {
    urlHandler = cb;
    return removeUrl;
  },
}));
vi.mock('../../platform/embeddedAuth.js', () => ({
  openEmbeddedAuth: vi.fn(),
  EmbeddedAuthCancelledError: class extends Error {},
}));
vi.mock('../../data/client.js', () => ({
  getClientForToken: (token: string) => ({ verifyToken: (id: string) => verifyToken(token, id) }),
}));

beforeEach(() => {
  urlHandler = null;
  browserFinished = null;
});
afterEach(() => {
  vi.clearAllMocks();
});

async function startRound(scope: 'read' | 'read,write' = 'read') {
  const { runOAuthRound, OAuthCancelledError } = await import('../oauthRound.js');
  const promise = runOAuthRound(scope);
  const authorizeUrl = new URL(openUrl.mock.lastCall![0]);
  return {
    promise,
    OAuthCancelledError,
    state: authorizeUrl.searchParams.get('state')!,
    authorizeUrl,
  };
}

describe('runOAuthRound (system browser) redirect handling', () => {
  it('sends the bmobile://oauth/ redirect, the requested scope, and a fresh unguessable state per round', async () => {
    verifyToken.mockResolvedValue({ scope: 'read', username: 'x' });
    const first = await startRound('read,write');
    urlHandler!(`bmobile://oauth/#access_token=t&state=${first.state}`);
    await first.promise;
    const second = await startRound();
    urlHandler!(`bmobile://oauth/#access_token=t&state=${second.state}`);
    await second.promise;

    expect(first.authorizeUrl.searchParams.get('redirect_uri')).toBe('bmobile://oauth/');
    expect(first.authorizeUrl.searchParams.get('scope')).toBe('read,write');
    expect(first.state).toMatch(/^[0-9a-f]{32}$/);
    expect(second.state).not.toBe(first.state);
  });

  it('accepts a matching redirect, verifies the token, and trusts the granted (not requested) scope', async () => {
    verifyToken.mockResolvedValue({ scope: 'read', username: 'dave' });
    const r = await startRound('read,write');
    urlHandler!(`bmobile://oauth/#access_token=tok&state=${r.state}`);
    await expect(r.promise).resolves.toEqual({
      accessToken: 'tok',
      grantedScope: 'read',
      username: 'dave',
    });
    expect(closeBrowser).toHaveBeenCalledOnce();
    expect(removeUrl).toHaveBeenCalledOnce();
  });

  it.each([
    ['wrong state', () => 'bmobile://oauth/#access_token=evil&state=deadbeef'],
    ['empty state', () => 'bmobile://oauth/#access_token=evil&state='],
  ])(
    'never trusts a forged redirect with %s: no token verification, round cancelled',
    async (_n, mk) => {
      const r = await startRound();
      urlHandler!(mk());
      await expect(r.promise).rejects.toBeInstanceOf(r.OAuthCancelledError);
      expect(verifyToken).not.toHaveBeenCalled();
    },
  );

  it('never trusts a forged redirect with no state at all: round rejects, token never verified', async () => {
    const r = await startRound();
    urlHandler!('bmobile://oauth/#access_token=evil');
    await expect(r.promise).rejects.toThrow(/state/i);
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it('treats access_denied as a cancellation, not an error', async () => {
    const r = await startRound();
    urlHandler!(`bmobile://oauth/#error=access_denied&state=${r.state}`);
    await expect(r.promise).rejects.toMatchObject({ name: 'OAuthCancelledError' });
    expect(verifyToken).not.toHaveBeenCalled();
  });

  it.each([
    'bmobile://entry/1',
    'bmobile://oauth.evil/#access_token=evil',
    'https://www.blipfoto.com/#access_token=evil&state=x',
    'bmobile:oauth/#access_token=evil',
  ])('ignores a non-redirect URL (%s) and keeps the round open', async (url) => {
    verifyToken.mockResolvedValue({ scope: 'read', username: 'ok' });
    const r = await startRound();
    urlHandler!(url);
    expect(verifyToken).not.toHaveBeenCalled();
    expect(removeUrl).not.toHaveBeenCalled();
    urlHandler!(`bmobile://oauth/#access_token=tok&state=${r.state}`);
    await expect(r.promise).resolves.toMatchObject({ accessToken: 'tok' });
  });

  it('rejects as cancelled when the browser is closed before any redirect', async () => {
    const r = await startRound();
    browserFinished!();
    await expect(r.promise).rejects.toBeInstanceOf(r.OAuthCancelledError);
    expect(removeUrl).toHaveBeenCalledOnce();
  });

  it('settles only once: a second redirect after success is not verified again', async () => {
    verifyToken.mockResolvedValue({ scope: 'read', username: 'ok' });
    const r = await startRound();
    const handler = urlHandler!;
    handler(`bmobile://oauth/#access_token=tok&state=${r.state}`);
    handler(`bmobile://oauth/#access_token=tok2&state=${r.state}`);
    await r.promise;
    expect(verifyToken).toHaveBeenCalledTimes(1);
  });

  it('agrees with deepLinkResolver: every URL the round consumes is one the router ignores as oauth', async () => {
    const r = await startRound();
    const redirect = `bmobile://oauth/#access_token=t&state=${r.state}`;
    expect(resolveDeepLink(redirect)).toEqual({ kind: 'oauth' });
    verifyToken.mockResolvedValue({ scope: 'read', username: 'ok' });
    urlHandler!(redirect);
    await r.promise;
  });
});
