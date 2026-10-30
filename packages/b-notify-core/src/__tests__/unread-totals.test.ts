// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Mocked at the fetch boundary, as b-push's blipfoto tests are.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlipfotoError } from '@b-oss/b-api';
import { fetchUnreadTotals, TokenInvalidError } from '../unread-totals.js';

const envelope = (data: unknown): string => JSON.stringify({ data, error: null });
const errorEnvelope = (code: number, message: string): string =>
  JSON.stringify({ data: null, error: { code, message } });

function mockFetchOnce(body: string, status = 200): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(body, { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchUnreadTotals', () => {
  it('returns both totals, defaulting a missing key to 0', async () => {
    mockFetchOnce(envelope({ comments: 3 }));
    expect(await fetchUnreadTotals('a-token')).toEqual({ comments: 3, notifications: 0 });
  });

  it('requests messages/totals/unread with both return flags set, and nothing else', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(envelope({ comments: 0, notifications: 0 })));
    await fetchUnreadTotals('a-token');
    expect(spy).toHaveBeenCalledTimes(1);
    const url = new URL(spy.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/4/messages/totals/unread.json');
    expect(url.searchParams.get('return_comments')).toBe('1');
    expect(url.searchParams.get('return_notifications')).toBe('1');
  });

  it('throws TokenInvalidError on a token-invalid error code', async () => {
    mockFetchOnce(errorEnvelope(51, 'Invalid token'));
    await expect(fetchUnreadTotals('dead')).rejects.toBeInstanceOf(TokenInvalidError);
  });

  it('rethrows code 52 (client invalid) as a plain BlipfotoError', async () => {
    mockFetchOnce(errorEnvelope(52, 'The client is invalid.'));
    const err = await fetchUnreadTotals('t').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BlipfotoError);
    expect(err).not.toBeInstanceOf(TokenInvalidError);
  });

  it('lets a network failure through as an ordinary (non-token) error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('offline'));
    await expect(fetchUnreadTotals('t')).rejects.toThrow(/network/i);
  });
});
