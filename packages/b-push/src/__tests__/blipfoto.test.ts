// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// fetchUnreadTotals/fetchPushConfigured go through @b-oss/b-api's BlipfotoClient, which itself
// uses the global fetch by default — mocked here at the fetch boundary (same approach as
// fcm.test.ts) rather than re-implementing b-api's own envelope parsing in a second test double.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlipfotoError } from '@b-oss/b-api';
import {
  fetchUnreadTotals,
  fetchPushConfigured,
  isBearerUnrecognised,
  ReadTokenInvalidError,
} from '../blipfoto.js';

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

  it('rethrows code 52 (bearer not recognised) as a plain BlipfotoError, not ReadTokenInvalidError (b-oss#238)', async () => {
    // What the live API returns for a junk or unknown bearer: HTTP 200, code 52. A revoked user
    // token is 51, so a 52 is not "this user's token died" and must not trigger the reauth path.
    mockFetchOnce(errorEnvelope(52, 'The client is invalid.'));
    const err: unknown = await fetchUnreadTotals('junk').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BlipfotoError);
    expect(err).not.toBeInstanceOf(ReadTokenInvalidError);
    expect(isBearerUnrecognised(err)).toBe(true);
  });

  it('rethrows other errors unchanged', async () => {
    mockFetchOnce(errorEnvelope(11, 'Rate limited'));
    await expect(fetchUnreadTotals('a-read-token')).rejects.not.toBeInstanceOf(
      ReadTokenInvalidError,
    );
  });
});

describe('fetchPushConfigured', () => {
  it('asks Blipfoto for the push object (return_push=1) (b-oss#242)', async () => {
    // Blipfoto only includes `push` when asked; the old call omitted the flag, so every user
    // read as unconfigured in production while this file's fakes returned `push` regardless.
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(envelope({ push: { configured: 1, settings: {} } }), { status: 200 }),
      );
    await fetchPushConfigured('a-read-token');
    const url = new URL(spy.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/4/user/settings/notifications.json');
    expect(url.searchParams.get('return_push')).toBe('1');
  });

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

  it('does not treat code 52 as an invalid read token (b-oss#238)', async () => {
    mockFetchOnce(errorEnvelope(52, 'The client is invalid.'));
    const err: unknown = await fetchPushConfigured('junk').catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(ReadTokenInvalidError);
    expect(isBearerUnrecognised(err)).toBe(true);
  });
});

describe('isBearerUnrecognised', () => {
  it('is true only for a BlipfotoError with code 52', () => {
    expect(isBearerUnrecognised(new BlipfotoError(52, 'The client is invalid.'))).toBe(true);
    expect(isBearerUnrecognised(new BlipfotoError(51, 'Invalid token'))).toBe(false);
    expect(isBearerUnrecognised(new Error('52'))).toBe(false);
  });
});
