// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// fetchUnreadTotals/fetchPushConfigured go through @b-oss/b-api's BlipfotoClient, which itself
// uses the global fetch by default — mocked here at the fetch boundary (same approach as
// fcm.test.ts) rather than re-implementing b-api's own envelope parsing in a second test double.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchUnreadTotals, fetchPushConfigured, ReadTokenInvalidError } from '../blipfoto.js';

function envelope(data: unknown): string {
  return JSON.stringify({ data, error: null });
}

function errorEnvelope(code: number, message: string): string {
  return JSON.stringify({ data: null, error: { code, message } });
}

function mockFetchOnce(bodyText: string, status = 200): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(bodyText, { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchUnreadTotals', () => {
  it('returns both totals, defaulting a missing key to 0', async () => {
    mockFetchOnce(envelope({ comments: 3 }));
    const totals = await fetchUnreadTotals('a-read-token');
    expect(totals).toEqual({ comments: 3, notifications: 0 });
  });

  it('requests messages/totals/unread with both return flags set', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(envelope({ comments: 0, notifications: 0 }), { status: 200 }),
      );
    await fetchUnreadTotals('a-read-token');
    const url = new URL(spy.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/4/messages/totals/unread.json');
    expect(url.searchParams.get('return_comments')).toBe('1');
    expect(url.searchParams.get('return_notifications')).toBe('1');
  });

  it('throws ReadTokenInvalidError on a token-invalid error code', async () => {
    mockFetchOnce(errorEnvelope(51, 'Invalid token'));
    await expect(fetchUnreadTotals('a-dead-token')).rejects.toBeInstanceOf(ReadTokenInvalidError);
  });

  it('rethrows other errors unchanged', async () => {
    mockFetchOnce(errorEnvelope(11, 'Rate limited'));
    await expect(fetchUnreadTotals('a-read-token')).rejects.not.toBeInstanceOf(
      ReadTokenInvalidError,
    );
  });
});

describe('fetchPushConfigured', () => {
  it('reads push.configured === 1 as true', async () => {
    mockFetchOnce(envelope({ push: { configured: 1, settings: { comment_received: 1 } } }));
    expect(await fetchPushConfigured('a-read-token')).toBe(true);
  });

  it('treats a missing push channel as not configured', async () => {
    mockFetchOnce(envelope({ feed: { configured: 1, settings: {} } }));
    expect(await fetchPushConfigured('a-read-token')).toBe(false);
  });

  it('throws ReadTokenInvalidError on a token-invalid error code', async () => {
    mockFetchOnce(errorEnvelope(50, 'Invalid token'));
    await expect(fetchPushConfigured('a-dead-token')).rejects.toBeInstanceOf(ReadTokenInvalidError);
  });
});
