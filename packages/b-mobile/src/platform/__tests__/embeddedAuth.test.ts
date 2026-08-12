// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// oauthRound.ts's `useEmbedded` path (FLW-20's "force new sign-in") is exercised directly here,
// same reasoning as platform/http.test.ts and platform/accessibility.test.ts — this is exactly
// the kind of native-bridge round-trip most likely to be got subtly wrong.

import { afterEach, describe, expect, it, vi } from 'vitest';

const openMock = vi.fn<(options: { url: string; redirectPrefix: string }) => Promise<unknown>>();
let isNative = true;

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNative },
  registerPlugin: () => ({ open: (options: unknown) => openMock(options as never) }),
}));

afterEach(() => {
  openMock.mockReset();
  isNative = true;
});

describe('openEmbeddedAuth', () => {
  it('opens the native plugin with the given url/redirectPrefix and returns the redirect URL', async () => {
    openMock.mockResolvedValue({ redirectUrl: 'bmobile://oauth/#access_token=abc' });
    const { openEmbeddedAuth } = await import('../embeddedAuth.js');

    const result = await openEmbeddedAuth(
      'https://blipfoto.com/oauth/authorize',
      'bmobile://oauth/',
    );

    expect(openMock).toHaveBeenCalledWith({
      url: 'https://blipfoto.com/oauth/authorize',
      redirectPrefix: 'bmobile://oauth/',
    });
    expect(result).toBe('bmobile://oauth/#access_token=abc');
  });

  it('maps a native "cancelled" rejection to EmbeddedAuthCancelledError', async () => {
    openMock.mockRejectedValue(new Error('cancelled'));
    const { openEmbeddedAuth, EmbeddedAuthCancelledError } = await import('../embeddedAuth.js');

    await expect(openEmbeddedAuth('https://x', 'bmobile://oauth/')).rejects.toBeInstanceOf(
      EmbeddedAuthCancelledError,
    );
  });

  it('rethrows any other native rejection unchanged', async () => {
    const boom = new Error('something else broke');
    openMock.mockRejectedValue(boom);
    const { openEmbeddedAuth } = await import('../embeddedAuth.js');

    await expect(openEmbeddedAuth('https://x', 'bmobile://oauth/')).rejects.toBe(boom);
  });

  it('rejects with EmbeddedAuthUnavailableError off-native, without calling the plugin', async () => {
    isNative = false;
    const { openEmbeddedAuth, EmbeddedAuthUnavailableError } = await import('../embeddedAuth.js');

    await expect(openEmbeddedAuth('https://x', 'bmobile://oauth/')).rejects.toBeInstanceOf(
      EmbeddedAuthUnavailableError,
    );
    expect(openMock).not.toHaveBeenCalled();
  });
});
