// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// withRateLimitFallback is genuinely new branching logic (b-oss#128) — worth its own direct test
// rather than trusting it by inspection: a wrong branch here either silently serves anonymous
// content where the user expected their own account's view, or turns a real, unrelated failure
// into a confusing double-request.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BlipfotoError } from '@b-oss/b-api';

vi.mock('@b-oss/b-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@b-oss/b-api')>();
  return {
    ...actual,
    BlipfotoClient: vi.fn().mockImplementation(function (this: unknown, accessToken: string) {
      Object.assign(this as object, { accessToken });
    }),
  };
});

// Native path (no `window` needed) — the test never makes a real request, so the actual base URL
// doesn't matter; this just avoids resolveBaseUrl's browser-dev-proxy branch, which needs
// `window` and this plain (non-jsdom) test environment doesn't have one.
vi.mock('../../platform/appState.js', () => ({ isNativePlatform: () => true }));
vi.mock('../../platform/http.js', () => ({ platformFetch: vi.fn() }));
vi.mock('../../platform/upload.js', () => ({ getMultipartImpl: () => undefined }));
vi.mock('../../platform/secureStorage.js', () => ({
  getToken: vi.fn().mockResolvedValue('user-token'),
}));
vi.mock('../../state/authReady.js', () => ({ authReady: Promise.resolve() }));
vi.mock('../../state/accountsStore.js', () => ({
  useAccountsStore: {
    getState: () => ({
      accounts: [{ id: 'acc1', username: 'cyclops', appTokenScope: 'read,write' }],
      activeAccountId: 'acc1',
    }),
  },
}));

const { withRateLimitFallback } = await import('../client.js');

describe('withRateLimitFallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls fn once, with the active account client, when it succeeds', async () => {
    const fn = vi.fn().mockResolvedValue('ok');
    const result = await withRateLimitFallback(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries against the anonymous client when the active account is rate-limited', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new BlipfotoError(11, 'rate limited'))
      .mockResolvedValueOnce('anonymous result');
    const result = await withRateLimitFallback(fn);
    expect(result).toBe('anonymous result');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry, and rethrows, for any other error', async () => {
    const fn = vi.fn().mockRejectedValue(new BlipfotoError(500, 'server exploded'));
    await expect(withRateLimitFallback(fn)).rejects.toThrow('server exploded');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry, and rethrows, a non-BlipfotoError', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(withRateLimitFallback(fn)).rejects.toThrow('network down');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
