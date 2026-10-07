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
    BlipfotoClient: vi.fn().mockImplementation(function (
      this: unknown,
      accessToken: string,
      _base: string,
      fetchImpl: typeof fetch,
    ) {
      Object.assign(this as object, { accessToken, fetchImpl });
    }),
  };
});

// Native path (no `window` needed) — the test never makes a real request, so the actual base URL
// doesn't matter; this just avoids resolveBaseUrl's browser-dev-proxy branch, which needs
// `window` and this plain (non-jsdom) test environment doesn't have one.
vi.mock('../../platform/appState.js', () => ({ isNativePlatform: () => true }));
const platformFetch = vi.fn<(...args: unknown[]) => Promise<Response>>();
vi.mock('../../platform/http.js', () => ({
  platformFetch: (...args: unknown[]) => platformFetch(...args),
}));
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

const { withRateLimitFallback, getClient, getClientForAccount, setAppTokenRejectedHandler } =
  await import('../client.js');

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

describe('app-token rejection (FLW-02, b-oss#261)', () => {
  const rejected = vi.fn<(accountId: string) => void>();
  beforeEach(() => {
    vi.clearAllMocks();
    setAppTokenRejectedHandler(rejected);
  });

  function fetchOf(client: unknown): (url: string) => Promise<Response> {
    return (client as { fetchImpl: (url: string) => Promise<Response> }).fetchImpl;
  }
  function envelope(error: { code: number; message: string } | null): Response {
    return new Response(JSON.stringify({ data: error ? null : {}, error }), { status: 200 });
  }

  it("reports a 51 on the active account's app token, and still returns the response", async () => {
    platformFetch.mockResolvedValue(envelope({ code: 51, message: 'Invalid token' }));
    const response = await fetchOf(await getClient())('https://api.blipfoto.com/4/x.json');
    expect(rejected).toHaveBeenCalledWith('acc1');
    expect(await response.json()).toMatchObject({ error: { code: 51 } });
  });

  it('reports a 50 from getClientForAccount too', async () => {
    platformFetch.mockResolvedValue(envelope({ code: 50, message: 'Missing token' }));
    await fetchOf(await getClientForAccount('acc2'))('https://api.blipfoto.com/4/x.json');
    expect(rejected).toHaveBeenCalledWith('acc2');
  });

  it('ignores successful responses and other errors', async () => {
    platformFetch.mockResolvedValueOnce(envelope(null));
    platformFetch.mockResolvedValueOnce(envelope({ code: 11, message: 'Rate limited' }));
    const fetchImpl = fetchOf(await getClient());
    await fetchImpl('https://api.blipfoto.com/4/a.json');
    await fetchImpl('https://api.blipfoto.com/4/b.json');
    expect(rejected).not.toHaveBeenCalled();
  });

  it("doesn't watch the service token: that one is b-push's to judge", async () => {
    platformFetch.mockResolvedValue(envelope({ code: 51, message: 'Invalid token' }));
    await fetchOf(await getClient('service'))('https://api.blipfoto.com/4/x.json');
    expect(rejected).not.toHaveBeenCalled();
  });
});
