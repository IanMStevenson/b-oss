// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// On desktop there is no system-browser round trip (no deep link comes back to the app), so every
// OAuth round runs in the embedded window even when the caller did not ask for it.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlatformKind } from '../../platform/platformKind.js';

let kind: PlatformKind = 'desktop';
vi.mock('../../platform/platformKind.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/platformKind.js')>()),
  platformKind: () => kind,
}));

const openEmbeddedAuthMock = vi.fn<(url: string, redirectPrefix: string) => Promise<string>>();
const openUrlMock = vi.fn<(url: string) => Promise<void>>();
vi.mock('../../platform/embeddedAuth.js', async () => {
  const actual = await vi.importActual<typeof import('../../platform/embeddedAuth.js')>(
    '../../platform/embeddedAuth.js',
  );
  return { ...actual, openEmbeddedAuth: (u: string, r: string) => openEmbeddedAuthMock(u, r) };
});
vi.mock('../../platform/browser.js', () => ({
  openUrl: (url: string) => openUrlMock(url),
  closeBrowser: vi.fn(),
  onBrowserFinished: () => () => {},
}));
vi.mock('../../platform/deepLinks.js', () => ({ onAppUrlOpen: () => () => {} }));
const verifyTokenMock = vi.fn();
vi.mock('../../data/client.js', () => ({
  getClientForToken: () => ({ verifyToken: verifyTokenMock }),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('runOAuthRound without asking for the embedded window', () => {
  it('desktop: still uses the embedded window, never the system browser', async () => {
    kind = 'desktop';
    verifyTokenMock.mockResolvedValue({ scope: 'read,write', username: 'carol' });
    openEmbeddedAuthMock.mockImplementation((url) =>
      Promise.resolve(
        `bmobile://oauth/#access_token=tok&state=${new URL(url).searchParams.get('state')!}`,
      ),
    );
    const { runOAuthRound } = await import('../oauthRound.js');

    const result = await runOAuthRound('read,write');

    expect(openEmbeddedAuthMock).toHaveBeenCalledTimes(1);
    expect(openUrlMock).not.toHaveBeenCalled();
    expect(result.username).toBe('carol');
  });

  it('android: the caller still chooses, so the default stays the system browser', async () => {
    kind = 'android';
    openUrlMock.mockResolvedValue(undefined);
    const { runOAuthRound } = await import('../oauthRound.js');

    // The system-browser round waits for a deep link that never comes here; only the routing matters.
    void runOAuthRound('read');
    await Promise.resolve();
    await Promise.resolve();

    expect(openUrlMock).toHaveBeenCalledTimes(1);
    expect(openEmbeddedAuthMock).not.toHaveBeenCalled();
  });
});
