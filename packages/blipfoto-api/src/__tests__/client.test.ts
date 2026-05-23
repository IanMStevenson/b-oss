// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { beforeAll, afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import { BlipfotoClient, BlipfotoError, NetworkError } from '../index.js';

const BASE = 'https://api.blipfoto.com/4/';

function envelope<T>(data: T) {
  return { version: 4, error: null, data };
}

function errorEnvelope(code: number, message: string) {
  return { version: 4, error: { object: 'Error', code, message }, data: null };
}

function rateLimitHeaders(remaining = 100, reset = 300) {
  return {
    'X-RateLimit-Limit': '200',
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(reset),
  };
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const TOKEN = 'test-token';

function makeClient() {
  return new BlipfotoClient(TOKEN, BASE);
}

const mockUser = {
  username: 'gbradley',
  avatar_url: 'https://example.com/avatar.jpg',
  icons: [{ icon_id_str: '123', icon_url: 'https://example.com/icon.jpg' }],
};

const mockUserDetails = {
  journal_title: 'My Journal',
  biography: 'A bio',
  biography_html: '<p>A bio</p>',
  country_code: 'GB',
  entry_total: 42,
  member: 1 as const,
  privacy: 0 as const,
};

const mockEntryStub = {
  entry_id_str: '9876543210',
  date: '2024-01-15',
  date_stamp: 1705276800,
  title: 'A great day',
  username: 'gbradley',
  location: null,
  thumbnail_url: 'https://example.com/thumb.jpg',
  image_url: 'https://example.com/image.jpg',
};

describe('getUserProfile', () => {
  it('returns parsed user and details when returnDetails: true', async () => {
    server.use(
      http.get(`${BASE}user/profile.json`, () =>
        HttpResponse.json(envelope({ user: mockUser, visibility: 1, details: mockUserDetails }), {
          headers: rateLimitHeaders(),
        }),
      ),
    );
    const client = makeClient();
    const result = await client.getUserProfile({ returnDetails: true });
    expect(result.user.username).toBe('gbradley');
    expect(result.details?.journal_title).toBe('My Journal');
  });

  it('omits details object when returnDetails not set', async () => {
    server.use(
      http.get(`${BASE}user/profile.json`, () =>
        HttpResponse.json(envelope({ user: mockUser, visibility: 1 as const }), {
          headers: rateLimitHeaders(),
        }),
      ),
    );
    const client = makeClient();
    const result = await client.getUserProfile();
    expect(result.user.username).toBe('gbradley');
    expect(result.details).toBeUndefined();
  });

  it('throws BlipfotoError with isTokenInvalid === true on error code 51', async () => {
    server.use(
      http.get(`${BASE}user/profile.json`, () =>
        HttpResponse.json(errorEnvelope(51, 'The user access token is invalid.'), {
          headers: rateLimitHeaders(),
        }),
      ),
    );
    const client = makeClient();
    await expect(client.getUserProfile()).rejects.toSatisfy(
      (err: unknown) => err instanceof BlipfotoError && err.isTokenInvalid,
    );
  });

  it('updates rateLimitInfo after a successful call', async () => {
    server.use(
      http.get(`${BASE}user/profile.json`, () =>
        HttpResponse.json(envelope({ user: mockUser, visibility: 1 as const }), {
          headers: rateLimitHeaders(50, 120),
        }),
      ),
    );
    const client = makeClient();
    expect(client.rateLimitInfo).toBeNull();
    await client.getUserProfile();
    expect(client.rateLimitInfo).toEqual({ limit: 200, remaining: 50, resetInSeconds: 120 });
  });
});

describe('getJournalEntries', () => {
  it('returns page + entries array', async () => {
    server.use(
      http.get(`${BASE}entries/journal.json`, () =>
        HttpResponse.json(
          envelope({ page: { index: 0, size: 10, more: 0 }, entries: [mockEntryStub] }),
          { headers: rateLimitHeaders() },
        ),
      ),
    );
    const client = makeClient();
    const result = await client.getJournalEntries();
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].entry_id_str).toBe('9876543210');
  });

  it('sends correct page_index and page_size query params', async () => {
    server.use(
      http.get(`${BASE}entries/journal.json`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('page_index')).toBe('2');
        expect(url.searchParams.get('page_size')).toBe('50');
        return HttpResponse.json(envelope({ page: { index: 2, size: 50, more: 1 }, entries: [] }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    const client = makeClient();
    await client.getJournalEntries({ pageIndex: 2, pageSize: 50 });
  });

  it('handles more: 0 (last page)', async () => {
    server.use(
      http.get(`${BASE}entries/journal.json`, () =>
        HttpResponse.json(envelope({ page: { index: 5, size: 100, more: 0 }, entries: [] }), {
          headers: rateLimitHeaders(),
        }),
      ),
    );
    const client = makeClient();
    const result = await client.getJournalEntries();
    expect(result.page.more).toBe(0);
  });
});

describe('getEntry', () => {
  const mockEntryDetails = {
    journal_title: 'My Journal',
    description: 'A description',
    description_html: '<p>A description</p>',
    tags: ['nature', 'photography'],
    views: { total: 100 },
    stars: { total: 5, starred: 0 as const },
    favorites: { total: 2, favorited: 0 as const },
  };
  const mockEntryMetadata = {
    Make: 'Canon',
    Model: 'EOS R5',
    ExposureTime: '1/200',
    FNumber: 'f/2.8',
    FocalLength: '50mm',
    ISO: '400',
    camera: 'Canon EOS R5',
  };
  const mockEntryComments = {
    total: 3,
    list: [
      {
        comment_id_str: '111',
        parent_id_str: null,
        entry_id_str: '9876543210',
        thumbnail_url: 'https://example.com/cthumb.jpg',
        content: 'Great shot!',
        content_html: '<p>Great shot!</p>',
        commenter: { username: 'friend', avatar_url: 'https://example.com/favatar.jpg' },
        replies: null,
      },
    ],
  };
  const mockImageUrls = {
    lores: 'https://example.com/lores.jpg',
    stdres: 'https://example.com/stdres.jpg',
    hires: 'https://example.com/hires.jpg',
    original: 'https://example.com/original.jpg',
  };

  it('returns entry with details, metadata, comments, and image_urls when all options enabled', async () => {
    server.use(
      http.get(`${BASE}entry.json`, () =>
        HttpResponse.json(
          envelope({
            entry: mockEntryStub,
            details: mockEntryDetails,
            metadata: mockEntryMetadata,
            comments: mockEntryComments,
            image_urls: mockImageUrls,
          }),
          { headers: rateLimitHeaders() },
        ),
      ),
    );
    const client = makeClient();
    const result = await client.getEntry('9876543210', {
      returnDetails: true,
      returnMetadata: true,
      returnComments: true,
      includeReplies: true,
      returnImageUrls: true,
    });
    expect(result.entry.entry_id_str).toBe('9876543210');
    expect(result.details?.journal_title).toBe('My Journal');
    expect(result.metadata?.Make).toBe('Canon');
    expect(result.comments?.total).toBe(3);
    expect(result.image_urls?.original).toBe('https://example.com/original.jpg');
  });

  it('returns bare entry stub when no options set', async () => {
    server.use(
      http.get(`${BASE}entry.json`, () =>
        HttpResponse.json(envelope({ entry: mockEntryStub }), { headers: rateLimitHeaders() }),
      ),
    );
    const client = makeClient();
    const result = await client.getEntry('9876543210');
    expect(result.entry.entry_id_str).toBe('9876543210');
    expect(result.details).toBeUndefined();
  });

  it('maps includeReplies correctly (only sent when returnComments is also true)', async () => {
    server.use(
      http.get(`${BASE}entry.json`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('return_comments')).toBeNull();
        expect(url.searchParams.get('include_replies')).toBeNull();
        return HttpResponse.json(envelope({ entry: mockEntryStub }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    const client = makeClient();
    // includeReplies=true but returnComments is false — include_replies must NOT be sent
    await client.getEntry('9876543210', { includeReplies: true });
  });
});

describe('rate limiting', () => {
  it('sleeps and retries once when first request returns code 11 and second succeeds', async () => {
    vi.useFakeTimers();
    let callCount = 0;
    server.use(
      http.get(`${BASE}user/profile.json`, () => {
        callCount++;
        if (callCount === 1) {
          return HttpResponse.json(errorEnvelope(11, 'Request limit reached.'), {
            headers: rateLimitHeaders(0, 60),
          });
        }
        return HttpResponse.json(envelope({ user: mockUser, visibility: 1 as const }), {
          headers: rateLimitHeaders(100, 300),
        });
      }),
    );
    const client = makeClient();
    const resultPromise = client.getUserProfile();
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    expect(result.user.username).toBe('gbradley');
    expect(callCount).toBe(2);
    vi.useRealTimers();
  });

  it('throws BlipfotoError with isRateLimited === true when both requests return code 11', async () => {
    vi.useFakeTimers();
    server.use(
      http.get(`${BASE}user/profile.json`, () =>
        HttpResponse.json(errorEnvelope(11, 'Request limit reached.'), {
          headers: rateLimitHeaders(0, 60),
        }),
      ),
    );
    const client = makeClient();
    const resultPromise = client.getUserProfile();
    // Attach rejection handler immediately so it is never "unhandled"
    const caught = resultPromise.catch((err: unknown) => err);
    await vi.runAllTimersAsync();
    const err = await caught;
    expect(err).toBeInstanceOf(BlipfotoError);
    expect((err as BlipfotoError).isRateLimited).toBe(true);
    vi.useRealTimers();
  });
});

describe('verifyToken', () => {
  it('returns username from token object', async () => {
    server.use(
      http.get(`${BASE}oauth/token.json`, () =>
        HttpResponse.json(envelope({ username: 'gbradley' }), { headers: rateLimitHeaders() }),
      ),
    );
    const client = makeClient();
    const result = await client.verifyToken('my-client-id');
    expect(result.username).toBe('gbradley');
  });

  it('throws BlipfotoError on error code 52 (invalid client)', async () => {
    server.use(
      http.get(`${BASE}oauth/token.json`, () =>
        HttpResponse.json(errorEnvelope(52, 'Invalid client.'), { headers: rateLimitHeaders() }),
      ),
    );
    const client = makeClient();
    await expect(client.verifyToken('bad-client')).rejects.toSatisfy(
      (err: unknown) => err instanceof BlipfotoError && err.code === 52,
    );
  });
});

describe('network failure', () => {
  it('throws NetworkError when fetch rejects', async () => {
    server.use(http.get(`${BASE}user/profile.json`, () => HttpResponse.error()));
    const client = makeClient();
    await expect(client.getUserProfile()).rejects.toBeInstanceOf(NetworkError);
  });
});
