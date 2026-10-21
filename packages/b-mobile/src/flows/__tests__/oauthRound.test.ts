// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// runOAuthRound's `useEmbedded` path (FLW-20's "force new sign-in") — the system-browser path
// isn't unit-tested at this layer today (only through accountsFlow.test.ts's mocked
// runOAuthRound), so this file focuses on what's new: routing to openEmbeddedAuth instead of
// openUrl/onAppUrlOpen, and mapping its cancellation to the same OAuthCancelledError the
// system-browser path produces.

import { afterEach, describe, expect, it, vi } from 'vitest';

const openEmbeddedAuthMock = vi.fn<(url: string, redirectPrefix: string) => Promise<string>>();
const openUrlMock = vi.fn<(url: string) => Promise<void>>();

vi.mock('../../platform/embeddedAuth.js', async () => {
  const actual = await vi.importActual<typeof import('../../platform/embeddedAuth.js')>(
    '../../platform/embeddedAuth.js',
  );
  return {
    ...actual,
    openEmbeddedAuth: (url: string, redirectPrefix: string) =>
      openEmbeddedAuthMock(url, redirectPrefix),
  };
});

vi.mock('../../platform/browser.js', () => ({
  openUrl: (url: string) => openUrlMock(url),
  closeBrowser: vi.fn(),
  onBrowserFinished: () => () => {},
}));

vi.mock('../../platform/deepLinks.js', () => ({
  onAppUrlOpen: () => () => {},
}));

const verifyTokenMock = vi.fn();
vi.mock('../../data/client.js', () => ({
  getClientForToken: () => ({ verifyToken: verifyTokenMock }),
}));

afterEach(() => {
  vi.clearAllMocks();
});

function stateFromUrl(url: string): string {
  return new URL(url).searchParams.get('state')!;
}

describe('runOAuthRound({ useEmbedded: true })', () => {
  it('opens the embedded browser instead of the system browser, and verifies the resulting token', async () => {
    verifyTokenMock.mockResolvedValue({ scope: 'read,write', username: 'carol' });
    openEmbeddedAuthMock.mockImplementation((url) => {
      const state = stateFromUrl(url);
      return Promise.resolve(`bmobile://oauth/#access_token=tok123&state=${state}`);
    });
    const { runOAuthRound } = await import('../oauthRound.js');

    const result = await runOAuthRound('read,write', { useEmbedded: true });

    expect(openUrlMock).not.toHaveBeenCalled();
    expect(openEmbeddedAuthMock).toHaveBeenCalledWith(expect.any(String), 'bmobile://oauth/');
    expect(result.accessToken).toBe('tok123');
    expect(result.grantedScope).toBe('read,write');
    expect(result.username).toBe('carol');
  });

  it('maps an embedded cancellation to OAuthCancelledError', async () => {
    const { runOAuthRound, OAuthCancelledError } = await import('../oauthRound.js');
    const { EmbeddedAuthCancelledError } = await import('../../platform/embeddedAuth.js');
    openEmbeddedAuthMock.mockRejectedValue(new EmbeddedAuthCancelledError());

    await expect(runOAuthRound('read', { useEmbedded: true })).rejects.toBeInstanceOf(
      OAuthCancelledError,
    );
    expect(verifyTokenMock).not.toHaveBeenCalled();
  });

  it('a state mismatch on the embedded redirect is discarded as a cancellation', async () => {
    const { runOAuthRound, OAuthCancelledError } = await import('../oauthRound.js');
    openEmbeddedAuthMock.mockResolvedValue(
      'bmobile://oauth/#access_token=tok&state=not-the-real-state',
    );

    await expect(runOAuthRound('read', { useEmbedded: true })).rejects.toBeInstanceOf(
      OAuthCancelledError,
    );
  });

  it('without useEmbedded, still uses the system browser as before', async () => {
    const { runOAuthRound } = await import('../oauthRound.js');
    // Never resolves — this test only asserts which path was taken, not the full round.
    openUrlMock.mockImplementation(() => new Promise(() => {}));
    void runOAuthRound('read,write');

    await vi.waitFor(() => expect(openUrlMock).toHaveBeenCalled());
    expect(openEmbeddedAuthMock).not.toHaveBeenCalled();
  });
});
