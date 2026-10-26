// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { isNative, platformFetch } = vi.hoisted(() => ({
  isNative: vi.fn(() => true),
  platformFetch: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: isNative } }));
vi.mock('../http.js', () => ({ platformFetch }));

import { CONNECTIVITY_TIMEOUT_MS, isOnline } from '../connectivity.js';

beforeEach(() => {
  isNative.mockReturnValue(true);
  platformFetch.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('isOnline', () => {
  it('is true when the resolver answers at all, whatever the status', async () => {
    platformFetch.mockResolvedValue(new Response('', { status: 400 }));
    expect(await isOnline()).toBe(true);
  });

  it('is false when the request fails', async () => {
    platformFetch.mockRejectedValue(new Error('Unable to resolve host'));
    expect(await isOnline()).toBe(false);
  });

  it('is false when the request hangs past the timeout', async () => {
    vi.useFakeTimers();
    platformFetch.mockReturnValue(new Promise(() => {}));
    const result = isOnline();
    await vi.advanceTimersByTimeAsync(CONNECTIVITY_TIMEOUT_MS);
    expect(await result).toBe(false);
  });

  it('uses the browser flag, without probing, off-device', async () => {
    isNative.mockReturnValue(false);
    expect(await isOnline()).toBe(navigator.onLine);
    expect(platformFetch).not.toHaveBeenCalled();
  });
});
