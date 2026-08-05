// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// §19 layer 1 — getLaunchUrl() is Phase 12.3's new cold-start half of the deep-link surface
// (onAppUrlOpen, the warm-start half, was already exercised via flows/oauthRound.ts's own
// consumer). Direct test, same reasoning as platform/http.test.ts.

import { afterEach, describe, expect, it, vi } from 'vitest';

let isNative = true;
const getLaunchUrl = vi.fn<() => Promise<{ url: string } | undefined>>();

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNative },
}));
vi.mock('@capacitor/app', () => ({
  App: {
    getLaunchUrl: () => getLaunchUrl(),
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
  },
}));

afterEach(() => {
  vi.clearAllMocks();
  isNative = true;
});

describe('getLaunchUrl', () => {
  it('returns null on web without calling the native plugin', async () => {
    isNative = false;
    const { getLaunchUrl: subject } = await import('../deepLinks.js');
    expect(await subject()).toBeNull();
    expect(getLaunchUrl).not.toHaveBeenCalled();
  });

  it('returns the launch URL when the app was opened via a deep link', async () => {
    getLaunchUrl.mockResolvedValue({ url: 'bmobile://entry/123' });
    const { getLaunchUrl: subject } = await import('../deepLinks.js');
    expect(await subject()).toBe('bmobile://entry/123');
  });

  it('returns null for an ordinary cold start (no launch URL)', async () => {
    getLaunchUrl.mockResolvedValue(undefined);
    const { getLaunchUrl: subject } = await import('../deepLinks.js');
    expect(await subject()).toBeNull();
  });
});
