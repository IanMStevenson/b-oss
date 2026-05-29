// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
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

const APP_TOKEN = 'test-client-id';
const USER_TOKEN = 'test-user-token';

function makeAppClient() {
  return new BlipfotoClient(APP_TOKEN, BASE);
}

function makeUserClient() {
  return new BlipfotoClient(USER_TOKEN, BASE);
}

// ── Shared fixtures ───────────────────────────────────────────────────────────

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

const mockPage = { index: 0, size: 10, more: 0 as const };

const mockComment = {
  comment_id_str: '111',
  parent_id_str: null,
  entry_id_str: '9876543210',
  thumbnail_url: 'https://example.com/cthumb.jpg',
  content: 'Great shot!',
  content_html: '<p>Great shot!</p>',
  commenter: { username: 'friend', avatar_url: 'https://example.com/favatar.jpg' },
  actions: { reply: 1 as const, edit: 0 as const, delete: 0 as const },
  replies: null,
};

const mockFriendship = {
  source: 'gbradley',
  target: 'friend',
  state: 1 as const,
  actions: { follow: 0 as const, unfollow: 1 as const },
};

const mockToken = {
  access_token: 'abc123',
  scope: 'read,write',
  token_type: 'bearer',
  username: 'gbradley',
};

const mockAward = {
  award_id_str: '1',
  icon_url: 'https://example.com/award.png',
  added_stamp: 1407321393,
  secret: 0 as const,
};

// ── Config ────────────────────────────────────────────────────────────────────

describe('getCountries', () => {
  it('returns countries array (App auth)', async () => {
    server.use(
      http.get(`${BASE}config/countries.json`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBe(`Bearer ${APP_TOKEN}`);
        return HttpResponse.json(
          envelope({ countries: [{ country_code: 'GB', title: 'United Kingdom' }] }),
          { headers: rateLimitHeaders() },
        );
      }),
    );
    const result = await makeAppClient().getCountries();
    expect(result.countries[0].country_code).toBe('GB');
  });

  it('returns countries array (User auth)', async () => {
    server.use(
      http.get(`${BASE}config/countries.json`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBe(`Bearer ${USER_TOKEN}`);
        return HttpResponse.json(
          envelope({ countries: [{ country_code: 'US', title: 'United States' }] }),
          { headers: rateLimitHeaders() },
        );
      }),
    );
    const result = await makeUserClient().getCountries();
    expect(result.countries[0].country_code).toBe('US');
  });
});

describe('getLocales', () => {
  it('returns locales array', async () => {
    server.use(
      http.get(`${BASE}config/locales.json`, () =>
        HttpResponse.json(
          envelope({ locales: [{ locale_code: 'en_GB', title: 'English (UK)' }] }),
          { headers: rateLimitHeaders() },
        ),
      ),
    );
    const result = await makeAppClient().getLocales();
    expect(result.locales[0].locale_code).toBe('en_GB');
  });
});

describe('getTerms', () => {
  it('returns reserved array', async () => {
    server.use(
      http.get(`${BASE}config/terms.json`, () =>
        HttpResponse.json(envelope({ reserved: ['admin', 'blipfoto'] }), {
          headers: rateLimitHeaders(),
        }),
      ),
    );
    const result = await makeAppClient().getTerms();
    expect(result.reserved).toContain('admin');
  });
});

// ── Entry lists ───────────────────────────────────────────────────────────────

describe('getFavoriteEntries', () => {
  it('returns page + entries (App auth)', async () => {
    server.use(
      http.get(`${BASE}entries/favorites.json`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBe(`Bearer ${APP_TOKEN}`);
        return HttpResponse.json(envelope({ page: mockPage, entries: [mockEntryStub] }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    const result = await makeAppClient().getFavoriteEntries();
    expect(result.entries[0].entry_id_str).toBe('9876543210');
  });

  it('sends username param when provided', async () => {
    server.use(
      http.get(`${BASE}entries/favorites.json`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('username')).toBe('gbradley');
        return HttpResponse.json(envelope({ page: mockPage, entries: [] }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    await makeAppClient().getFavoriteEntries({ username: 'gbradley' });
  });

  it('sends pagination params', async () => {
    server.use(
      http.get(`${BASE}entries/favorites.json`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('page_index')).toBe('1');
        expect(url.searchParams.get('page_size')).toBe('20');
        return HttpResponse.json(envelope({ page: mockPage, entries: [] }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    await makeUserClient().getFavoriteEntries({ pageIndex: 1, pageSize: 20 });
  });
});

describe('getFollowingEntries (User auth only)', () => {
  it('returns page + entries', async () => {
    server.use(
      http.get(`${BASE}entries/following.json`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBe(`Bearer ${USER_TOKEN}`);
        return HttpResponse.json(envelope({ page: mockPage, entries: [mockEntryStub] }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    const result = await makeUserClient().getFollowingEntries();
    expect(result.entries).toHaveLength(1);
  });

  it('sends pagination params', async () => {
    server.use(
      http.get(`${BASE}entries/following.json`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('page_index')).toBe('2');
        expect(url.searchParams.get('page_size')).toBe('5');
        return HttpResponse.json(envelope({ page: mockPage, entries: [] }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    await makeUserClient().getFollowingEntries({ pageIndex: 2, pageSize: 5 });
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
    const client = makeAppClient();
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
    await makeAppClient().getJournalEntries({ pageIndex: 2, pageSize: 50 });
  });

  it('handles more: 0 (last page)', async () => {
    server.use(
      http.get(`${BASE}entries/journal.json`, () =>
        HttpResponse.json(envelope({ page: { index: 5, size: 100, more: 0 }, entries: [] }), {
          headers: rateLimitHeaders(),
        }),
      ),
    );
    const result = await makeAppClient().getJournalEntries();
    expect(result.page.more).toBe(0);
  });
});

describe('getRecentEntries', () => {
  it('returns page + entries (App auth)', async () => {
    server.use(
      http.get(`${BASE}entries/recent.json`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBe(`Bearer ${APP_TOKEN}`);
        return HttpResponse.json(envelope({ page: mockPage, entries: [mockEntryStub] }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    const result = await makeAppClient().getRecentEntries();
    expect(result.entries[0].entry_id_str).toBe('9876543210');
  });

  it('sends pagination params', async () => {
    server.use(
      http.get(`${BASE}entries/recent.json`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('page_size')).toBe('10');
        return HttpResponse.json(envelope({ page: mockPage, entries: [] }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    await makeAppClient().getRecentEntries({ pageSize: 10 });
  });
});

describe('getPopularEntries', () => {
  it('returns page + entries', async () => {
    server.use(
      http.get(`${BASE}entries/popular.json`, () =>
        HttpResponse.json(envelope({ page: mockPage, entries: [mockEntryStub] }), {
          headers: rateLimitHeaders(),
        }),
      ),
    );
    const result = await makeAppClient().getPopularEntries();
    expect(result.entries).toHaveLength(1);
  });
});

describe('getNewEntries', () => {
  it('returns page + entries', async () => {
    server.use(
      http.get(`${BASE}entries/new.json`, () =>
        HttpResponse.json(envelope({ page: mockPage, entries: [mockEntryStub] }), {
          headers: rateLimitHeaders(),
        }),
      ),
    );
    const result = await makeAppClient().getNewEntries();
    expect(result.entries).toHaveLength(1);
  });
});

describe('searchEntries (User auth only)', () => {
  it('sends text query and sort', async () => {
    server.use(
      http.get(`${BASE}entries/search.json`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('query')).toBe('#landscape');
        expect(url.searchParams.get('sort')).toBe('date');
        return HttpResponse.json(envelope({ page: mockPage, entries: [] }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    await makeUserClient().searchEntries({ query: '#landscape', sort: 'date' });
  });

  it('sends radial location params', async () => {
    server.use(
      http.get(`${BASE}entries/search.json`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('location_type')).toBe('radial');
        expect(url.searchParams.get('lat')).toBe('51.5');
        expect(url.searchParams.get('lon')).toBe('-0.1');
        expect(url.searchParams.get('distance')).toBe('10');
        return HttpResponse.json(envelope({ page: mockPage, entries: [] }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    await makeUserClient().searchEntries({
      location_type: 'radial',
      lat: 51.5,
      lon: -0.1,
      distance: 10,
    });
  });

  it('sends bounding box location params', async () => {
    server.use(
      http.get(`${BASE}entries/search.json`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('location_type')).toBe('bounding_box');
        expect(url.searchParams.get('min_lat')).toBe('50');
        expect(url.searchParams.get('max_lat')).toBe('55');
        return HttpResponse.json(envelope({ page: mockPage, entries: [] }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    await makeUserClient().searchEntries({
      location_type: 'bounding_box',
      min_lat: 50,
      max_lat: 55,
      min_lon: -5,
      max_lon: 2,
    });
  });
});

// ── Single entry ──────────────────────────────────────────────────────────────

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
  const mockEntryComments = { total: 3, list: [mockComment] };
  const mockImageUrls = {
    lores: 'https://example.com/lores.jpg',
    stdres: 'https://example.com/stdres.jpg',
    hires: 'https://example.com/hires.jpg',
    original: 'https://example.com/original.jpg',
  };
  const mockRelated = {
    previous: mockEntryStub,
    next: null,
    year_ago: null,
    year_ahead: mockEntryStub,
  };
  const mockActions = {
    star: 1 as const,
    favorite: 1 as const,
    comment: 1 as const,
    edit: 0 as const,
    delete: 0 as const,
  };

  it('returns entry with details, metadata, comments, and image_urls when all legacy options enabled', async () => {
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
    const result = await makeAppClient().getEntry('9876543210', {
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

  it('returns entry with related, friendships, and actions when new options enabled', async () => {
    server.use(
      http.get(`${BASE}entry.json`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('return_related')).toBe('1');
        expect(url.searchParams.get('return_friendships')).toBe('1');
        expect(url.searchParams.get('return_actions')).toBe('1');
        return HttpResponse.json(
          envelope({
            entry: mockEntryStub,
            related: mockRelated,
            friendships: [mockFriendship],
            actions: mockActions,
          }),
          { headers: rateLimitHeaders() },
        );
      }),
    );
    const result = await makeUserClient().getEntry('9876543210', {
      returnRelated: true,
      returnFriendships: true,
      returnActions: true,
    });
    expect(result.related?.year_ahead?.entry_id_str).toBe('9876543210');
    expect(result.friendships?.[0].state).toBe(1);
    expect(result.actions?.star).toBe(1);
  });

  it('returns bare entry stub when no options set', async () => {
    server.use(
      http.get(`${BASE}entry.json`, () =>
        HttpResponse.json(envelope({ entry: mockEntryStub }), { headers: rateLimitHeaders() }),
      ),
    );
    const result = await makeAppClient().getEntry('9876543210');
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
    await makeAppClient().getEntry('9876543210', { includeReplies: true });
  });
});

// ── Entry CRUD ────────────────────────────────────────────────────────────────

describe('publishEntry (User auth only)', () => {
  it('POSTs multipart with image blob and title', async () => {
    server.use(
      http.post(`${BASE}entry.json`, async ({ request }) => {
        expect(request.headers.get('Authorization')).toBe(`Bearer ${USER_TOKEN}`);
        const form = await request.formData();
        expect(form.get('title')).toBe('Test entry');
        expect(form.get('image')).toBeInstanceOf(Blob);
        return HttpResponse.json(envelope({ entry: mockEntryStub }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    const blob = new Blob(['fake-image'], { type: 'image/jpeg' });
    const result = await makeUserClient().publishEntry({ image: blob, title: 'Test entry' });
    expect(result.entry.entry_id_str).toBe('9876543210');
  });

  it('omits undefined optional fields from FormData', async () => {
    server.use(
      http.post(`${BASE}entry.json`, async ({ request }) => {
        const form = await request.formData();
        expect(form.has('title')).toBe(false);
        expect(form.has('tags')).toBe(false);
        return HttpResponse.json(envelope({ entry: mockEntryStub }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    const blob = new Blob(['fake-image'], { type: 'image/jpeg' });
    await makeUserClient().publishEntry({ image: blob });
  });

  it('sends EXIF overrides when provided', async () => {
    server.use(
      http.post(`${BASE}entry.json`, async ({ request }) => {
        const form = await request.formData();
        expect(form.get('exif_Make')).toBe('Sony');
        expect(form.get('exif_ISO')).toBe('800');
        return HttpResponse.json(envelope({ entry: mockEntryStub }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    const blob = new Blob(['fake-image'], { type: 'image/jpeg' });
    await makeUserClient().publishEntry({ image: blob, exif_Make: 'Sony', exif_ISO: '800' });
  });
});

describe('updateEntry (User auth only)', () => {
  it('PUTs multipart with entry_id and optional new image', async () => {
    server.use(
      http.put(`${BASE}entry.json`, async ({ request }) => {
        const form = await request.formData();
        expect(form.get('entry_id')).toBe('9876543210');
        expect(form.get('title')).toBe('Updated title');
        expect(form.get('image')).toBeInstanceOf(Blob);
        return HttpResponse.json(envelope({ entry: mockEntryStub }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    const blob = new Blob(['fake-image'], { type: 'image/jpeg' });
    await makeUserClient().updateEntry({
      entryId: '9876543210',
      image: blob,
      title: 'Updated title',
    });
  });

  it('PUTs without image blob when image not provided', async () => {
    server.use(
      http.put(`${BASE}entry.json`, async ({ request }) => {
        const form = await request.formData();
        expect(form.get('entry_id')).toBe('9876543210');
        expect(form.has('image')).toBe(false);
        return HttpResponse.json(envelope({ entry: mockEntryStub }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    await makeUserClient().updateEntry({ entryId: '9876543210', title: 'No image update' });
  });
});

describe('deleteEntry (User auth only)', () => {
  it('DELETEs with entry_id in body', async () => {
    server.use(
      http.delete(`${BASE}entry.json`, async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        expect(body.get('entry_id')).toBe('9876543210');
        return HttpResponse.json(envelope({ success: 1 }), { headers: rateLimitHeaders() });
      }),
    );
    const result = await makeUserClient().deleteEntry('9876543210');
    expect(result.success).toBe(1);
  });
});

// ── Comments ──────────────────────────────────────────────────────────────────

describe('postComment (User auth only)', () => {
  it('POSTs with entry_id and content', async () => {
    server.use(
      http.post(`${BASE}entry/comment.json`, async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        expect(body.get('entry_id')).toBe('9876543210');
        expect(body.get('content')).toBe('Nice photo!');
        expect(body.has('parent_id')).toBe(false);
        return HttpResponse.json(envelope({ comment: mockComment }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    const result = await makeUserClient().postComment({
      entryId: '9876543210',
      content: 'Nice photo!',
    });
    expect(result.comment.comment_id_str).toBe('111');
  });

  it('sends parent_id when replying', async () => {
    server.use(
      http.post(`${BASE}entry/comment.json`, async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        expect(body.get('parent_id')).toBe('222');
        return HttpResponse.json(envelope({ comment: mockComment }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    await makeUserClient().postComment({
      entryId: '9876543210',
      content: 'Reply!',
      parentId: '222',
    });
  });
});

describe('updateComment (User auth only)', () => {
  it('PUTs with comment_id and content', async () => {
    server.use(
      http.put(`${BASE}entry/comment.json`, async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        expect(body.get('comment_id')).toBe('111');
        expect(body.get('content')).toBe('Edited comment');
        return HttpResponse.json(envelope({ comment: mockComment }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    const result = await makeUserClient().updateComment({
      commentId: '111',
      content: 'Edited comment',
    });
    expect(result.comment.comment_id_str).toBe('111');
  });
});

describe('deleteComment (User auth only)', () => {
  it('DELETEs with comment_id in body', async () => {
    server.use(
      http.delete(`${BASE}entry/comment.json`, async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        expect(body.get('comment_id')).toBe('111');
        return HttpResponse.json(envelope({ success: 1 }), { headers: rateLimitHeaders() });
      }),
    );
    const result = await makeUserClient().deleteComment('111');
    expect(result.success).toBe(1);
  });
});

// ── Interactions ──────────────────────────────────────────────────────────────

describe('favoriteEntry (User auth only)', () => {
  it('POSTs with entry_id', async () => {
    server.use(
      http.post(`${BASE}entry/favorite.json`, async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        expect(body.get('entry_id')).toBe('9876543210');
        return HttpResponse.json(envelope({ success: 1 }), { headers: rateLimitHeaders() });
      }),
    );
    const result = await makeUserClient().favoriteEntry('9876543210');
    expect(result.success).toBe(1);
  });
});

describe('starEntry (User auth only)', () => {
  it('POSTs with entry_id', async () => {
    server.use(
      http.post(`${BASE}entry/star.json`, async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        expect(body.get('entry_id')).toBe('9876543210');
        return HttpResponse.json(envelope({ success: 1 }), { headers: rateLimitHeaders() });
      }),
    );
    const result = await makeUserClient().starEntry('9876543210');
    expect(result.success).toBe(1);
  });
});

describe('reportEntry (User auth only)', () => {
  it('POSTs with entry_id and reasons', async () => {
    server.use(
      http.post(`${BASE}entry/report.json`, async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        expect(body.get('entry_id')).toBe('9876543210');
        expect(body.get('reason_explicit')).toBe('1');
        expect(body.get('comment')).toBe('Inappropriate');
        expect(body.has('reason_copyright')).toBe(false);
        return HttpResponse.json(envelope({ success: 1 }), { headers: rateLimitHeaders() });
      }),
    );
    await makeUserClient().reportEntry('9876543210', { reason_explicit: 1 }, 'Inappropriate');
  });
});

// ── Calendar ──────────────────────────────────────────────────────────────────

const mockDay = {
  day: 15,
  month: 1,
  year: 2024,
  state: 1 as const,
  entry: mockEntryStub,
  actions: { publish: 0 as const },
};

describe('getJournalDay (User auth only)', () => {
  it('sends date param and returns day', async () => {
    server.use(
      http.get(`${BASE}journal/day.json`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('date')).toBe('2024-01-15');
        return HttpResponse.json(envelope({ day: mockDay }), { headers: rateLimitHeaders() });
      }),
    );
    const result = await makeUserClient().getJournalDay('2024-01-15');
    expect(result.day.state).toBe(1);
    expect(result.day.entry?.entry_id_str).toBe('9876543210');
  });
});

describe('getJournalMonth (User auth only)', () => {
  it('sends date param and returns month grid', async () => {
    server.use(
      http.get(`${BASE}journal/month.json`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('date')).toBe('2024-01-01');
        return HttpResponse.json(
          envelope({ month: 1, year: 2024, week_start: 1, days: [mockDay, null] }),
          { headers: rateLimitHeaders() },
        );
      }),
    );
    const result = await makeUserClient().getJournalMonth('2024-01-01');
    expect(result.month).toBe(1);
    expect(result.days[0]).not.toBeNull();
    expect(result.days[1]).toBeNull();
  });

  it('sends optional username and week_start', async () => {
    server.use(
      http.get(`${BASE}journal/month.json`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('username')).toBe('gbradley');
        expect(url.searchParams.get('week_start')).toBe('7');
        return HttpResponse.json(envelope({ month: 1, year: 2024, week_start: 7, days: [] }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    await makeUserClient().getJournalMonth('2024-01-01', {
      username: 'gbradley',
      weekStart: 7,
    });
  });
});

// ── Messages ──────────────────────────────────────────────────────────────────

describe('getRecentComments (User auth only)', () => {
  it('returns comments array', async () => {
    server.use(
      http.get(`${BASE}messages/comments/recent.json`, () =>
        HttpResponse.json(envelope({ comments: [mockComment] }), { headers: rateLimitHeaders() }),
      ),
    );
    const result = await makeUserClient().getRecentComments();
    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].comment_id_str).toBe('111');
  });

  it('sends size and since_id params', async () => {
    server.use(
      http.get(`${BASE}messages/comments/recent.json`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('size')).toBe('50');
        expect(url.searchParams.get('since_id')).toBe('999');
        return HttpResponse.json(envelope({ comments: [] }), { headers: rateLimitHeaders() });
      }),
    );
    await makeUserClient().getRecentComments({ size: 50, sinceId: '999' });
  });
});

describe('getRecentNotifications (User auth only)', () => {
  it('returns notifications array', async () => {
    const mockNotification = {
      notification_id_str: '555',
      content: 'Someone starred your entry',
      content_html: '<p>Someone starred your entry</p>',
      image_url: 'https://example.com/notif.jpg',
      link_url: 'https://example.com/entry',
    };
    server.use(
      http.get(`${BASE}messages/notifications/recent.json`, () =>
        HttpResponse.json(envelope({ notifications: [mockNotification] }), {
          headers: rateLimitHeaders(),
        }),
      ),
    );
    const result = await makeUserClient().getRecentNotifications();
    expect(result.notifications[0].notification_id_str).toBe('555');
  });
});

describe('markNotificationsRead (User auth only)', () => {
  it('PUTs with comma-separated notification_ids', async () => {
    server.use(
      http.put(`${BASE}messages/notifications/unread.json`, async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        expect(body.get('notification_ids')).toBe('1,2,3');
        return HttpResponse.json(envelope({ success: 1 }), { headers: rateLimitHeaders() });
      }),
    );
    const result = await makeUserClient().markNotificationsRead(['1', '2', '3']);
    expect(result.success).toBe(1);
  });
});

describe('getUnreadTotals (User auth only)', () => {
  it('returns comment and notification counts when both requested', async () => {
    server.use(
      http.get(`${BASE}messages/totals/unread.json`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('return_comments')).toBe('1');
        expect(url.searchParams.get('return_notifications')).toBe('1');
        return HttpResponse.json(envelope({ comments: 3, notifications: 7 }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    const result = await makeUserClient().getUnreadTotals({
      returnComments: true,
      returnNotifications: true,
    });
    expect(result.comments).toBe(3);
    expect(result.notifications).toBe(7);
  });

  it('omits params when not requested', async () => {
    server.use(
      http.get(`${BASE}messages/totals/unread.json`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.has('return_comments')).toBe(false);
        expect(url.searchParams.has('return_notifications')).toBe(false);
        return HttpResponse.json(envelope({}), { headers: rateLimitHeaders() });
      }),
    );
    await makeUserClient().getUnreadTotals();
  });
});

// ── OAuth ─────────────────────────────────────────────────────────────────────

describe('verifyToken', () => {
  it('returns username from token object', async () => {
    server.use(
      http.get(`${BASE}oauth/token.json`, () =>
        HttpResponse.json(envelope({ username: 'gbradley' }), { headers: rateLimitHeaders() }),
      ),
    );
    const result = await makeUserClient().verifyToken('my-client-id');
    expect(result.username).toBe('gbradley');
  });

  it('throws BlipfotoError on error code 52 (invalid client)', async () => {
    server.use(
      http.get(`${BASE}oauth/token.json`, () =>
        HttpResponse.json(errorEnvelope(52, 'Invalid client.'), { headers: rateLimitHeaders() }),
      ),
    );
    await expect(makeUserClient().verifyToken('bad-client')).rejects.toSatisfy(
      (err: unknown) => err instanceof BlipfotoError && err.code === 52,
    );
  });
});

describe('exchangeCode (App auth)', () => {
  it('POSTs authorization_code grant with correct params', async () => {
    server.use(
      http.post(`${BASE}oauth/token.json`, async ({ request }) => {
        expect(request.headers.get('Authorization')).toBe(`Bearer ${APP_TOKEN}`);
        const body = new URLSearchParams(await request.text());
        expect(body.get('grant_type')).toBe('authorization_code');
        expect(body.get('client_id')).toBe(APP_TOKEN);
        expect(body.get('code')).toBe('authcode123');
        expect(body.get('redirect_uri')).toBe('b-ark://oauth/callback');
        return HttpResponse.json(envelope({ token: mockToken }), { headers: rateLimitHeaders() });
      }),
    );
    const result = await makeAppClient().exchangeCode({
      clientId: APP_TOKEN,
      code: 'authcode123',
      redirectUri: 'b-ark://oauth/callback',
    });
    expect(result.token.access_token).toBe('abc123');
  });
});

describe('loginWithPassword (App auth)', () => {
  it('POSTs password grant and returns token', async () => {
    server.use(
      http.post(`${BASE}oauth/token.json`, async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        expect(body.get('grant_type')).toBe('password');
        expect(body.get('scope')).toBe('read,write');
        expect(body.get('username')).toBe('user@example.com');
        expect(body.has('return_user')).toBe(false);
        return HttpResponse.json(envelope({ token: mockToken }), { headers: rateLimitHeaders() });
      }),
    );
    const result = await makeAppClient().loginWithPassword({
      clientId: APP_TOKEN,
      scope: 'read,write',
      username: 'user@example.com',
      password: 'secret',
    });
    expect(result.token.username).toBe('gbradley');
  });

  it('sends return_user=1 and returns user object when returnUser: true', async () => {
    server.use(
      http.post(`${BASE}oauth/token.json`, async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        expect(body.get('return_user')).toBe('1');
        return HttpResponse.json(envelope({ token: mockToken, user: mockUser }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    const result = await makeAppClient().loginWithPassword({
      clientId: APP_TOKEN,
      scope: 'read',
      username: 'user@example.com',
      password: 'secret',
      returnUser: true,
    });
    expect(result.user?.username).toBe('gbradley');
  });
});

describe('revokeToken (User auth only)', () => {
  it('DELETEs oauth/token', async () => {
    server.use(
      http.delete(`${BASE}oauth/token.json`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBe(`Bearer ${USER_TOKEN}`);
        return HttpResponse.json(envelope({ success: 1 }), { headers: rateLimitHeaders() });
      }),
    );
    const result = await makeUserClient().revokeToken();
    expect(result.success).toBe(1);
  });
});

// ── User profile ──────────────────────────────────────────────────────────────

describe('getUserProfile', () => {
  it('returns parsed user and details when returnDetails: true (App auth)', async () => {
    server.use(
      http.get(`${BASE}user/profile.json`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBe(`Bearer ${APP_TOKEN}`);
        return HttpResponse.json(
          envelope({ user: mockUser, visibility: 1, details: mockUserDetails }),
          { headers: rateLimitHeaders() },
        );
      }),
    );
    const result = await makeAppClient().getUserProfile({ returnDetails: true });
    expect(result.user.username).toBe('gbradley');
    expect(result.details?.journal_title).toBe('My Journal');
  });

  it('sends return_entries=1 and return_friendship=1 when requested', async () => {
    server.use(
      http.get(`${BASE}user/profile.json`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('return_entries')).toBe('1');
        expect(url.searchParams.get('return_friendship')).toBe('1');
        return HttpResponse.json(
          envelope({
            user: mockUser,
            visibility: 1 as const,
            entries: { latest: mockEntryStub },
            friendship: mockFriendship,
          }),
          { headers: rateLimitHeaders() },
        );
      }),
    );
    const result = await makeUserClient().getUserProfile({
      returnEntries: true,
      returnFriendship: true,
    });
    expect(result.entries?.latest.entry_id_str).toBe('9876543210');
    expect(result.friendship?.state).toBe(1);
  });

  it('omits details object when returnDetails not set', async () => {
    server.use(
      http.get(`${BASE}user/profile.json`, () =>
        HttpResponse.json(envelope({ user: mockUser, visibility: 1 as const }), {
          headers: rateLimitHeaders(),
        }),
      ),
    );
    const result = await makeAppClient().getUserProfile();
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
    await expect(makeUserClient().getUserProfile()).rejects.toSatisfy(
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
    const client = makeAppClient();
    expect(client.rateLimitInfo).toBeNull();
    await client.getUserProfile();
    expect(client.rateLimitInfo).toEqual({ limit: 200, remaining: 50, resetInSeconds: 120 });
  });
});

describe('getUserAwards', () => {
  it('returns awards array (App auth)', async () => {
    server.use(
      http.get(`${BASE}user/awards.json`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBe(`Bearer ${APP_TOKEN}`);
        return HttpResponse.json(envelope({ awards: [mockAward] }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    const result = await makeAppClient().getUserAwards();
    expect(result.awards[0].award_id_str).toBe('1');
  });

  it('returns awards array (User auth)', async () => {
    server.use(
      http.get(`${BASE}user/awards.json`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBe(`Bearer ${USER_TOKEN}`);
        return HttpResponse.json(envelope({ awards: [mockAward] }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    const result = await makeUserClient().getUserAwards({ username: 'gbradley' });
    expect(result.awards[0].added_stamp).toBe(1407321393);
  });

  it('sends username param when provided', async () => {
    server.use(
      http.get(`${BASE}user/awards.json`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('username')).toBe('gbradley');
        return HttpResponse.json(envelope({ awards: [] }), { headers: rateLimitHeaders() });
      }),
    );
    await makeAppClient().getUserAwards({ username: 'gbradley' });
  });
});

describe('getUserSettings (User auth only)', () => {
  it('returns user settings', async () => {
    const mockSettings = {
      username: 'gbradley',
      journal_title: 'My Journal',
      real_name: 'Graham Bradley',
      real_name_search: 0 as const,
      biography: 'A photographer',
      locale_code: 'en_GB',
      country_code: 'GB',
      privacy: 0 as const,
      comments: 1 as const,
      avatar_url: 'https://example.com/avatar.jpg',
    };
    server.use(
      http.get(`${BASE}user/settings.json`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBe(`Bearer ${USER_TOKEN}`);
        return HttpResponse.json(envelope(mockSettings), { headers: rateLimitHeaders() });
      }),
    );
    const result = await makeUserClient().getUserSettings();
    expect(result.username).toBe('gbradley');
    expect(result.privacy).toBe(0);
  });
});

describe('updateUserSettings (User auth only)', () => {
  it('PUTs text fields without avatar', async () => {
    server.use(
      http.put(`${BASE}user/settings.json`, async ({ request }) => {
        const form = await request.formData();
        expect(form.get('journal_title')).toBe('New Title');
        expect(form.has('avatar')).toBe(false);
        return HttpResponse.json(envelope({ success: 1 }), { headers: rateLimitHeaders() });
      }),
    );
    const result = await makeUserClient().updateUserSettings({ journal_title: 'New Title' });
    expect(result.success).toBe(1);
  });

  it('includes avatar blob in FormData when provided', async () => {
    server.use(
      http.put(`${BASE}user/settings.json`, async ({ request }) => {
        const form = await request.formData();
        expect(form.get('avatar')).toBeInstanceOf(Blob);
        return HttpResponse.json(envelope({ success: 1 }), { headers: rateLimitHeaders() });
      }),
    );
    const avatarBlob = new Blob(['fake-avatar'], { type: 'image/jpeg' });
    await makeUserClient().updateUserSettings({ avatar: avatarBlob });
  });
});

describe('getNotificationSettings (User auth only)', () => {
  it('sends return_feed, return_email, return_push params', async () => {
    server.use(
      http.get(`${BASE}user/settings/notifications.json`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('return_feed')).toBe('1');
        expect(url.searchParams.get('return_email')).toBe('1');
        expect(url.searchParams.get('return_push')).toBe('1');
        return HttpResponse.json(
          envelope({
            feed: { configured: 1, settings: { new_comment: 1 } },
            email: { configured: 1, settings: null },
            push: { configured: 0, settings: null },
          }),
          { headers: rateLimitHeaders() },
        );
      }),
    );
    const result = await makeUserClient().getNotificationSettings({
      returnFeed: true,
      returnEmail: true,
      returnPush: true,
    });
    expect(result.feed?.configured).toBe(1);
    expect(result.push?.configured).toBe(0);
  });
});

describe('updateNotificationSettings (User auth only)', () => {
  it('PUTs setting key/value pairs', async () => {
    server.use(
      http.put(`${BASE}user/settings/notifications.json`, async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        expect(body.get('new_comment')).toBe('1');
        expect(body.get('new_follower')).toBe('0');
        return HttpResponse.json(envelope({ success: 1 }), { headers: rateLimitHeaders() });
      }),
    );
    const result = await makeUserClient().updateNotificationSettings({
      new_comment: 1,
      new_follower: 0,
    });
    expect(result.success).toBe(1);
  });
});

// ── Social ────────────────────────────────────────────────────────────────────

describe('getFollowing', () => {
  it('returns page + users (App auth)', async () => {
    server.use(
      http.get(`${BASE}users/following.json`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBe(`Bearer ${APP_TOKEN}`);
        return HttpResponse.json(envelope({ page: mockPage, users: [mockUser] }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    const result = await makeAppClient().getFollowing();
    expect(result.users[0].username).toBe('gbradley');
  });

  it('returns page + users (User auth)', async () => {
    server.use(
      http.get(`${BASE}users/following.json`, ({ request }) => {
        expect(request.headers.get('Authorization')).toBe(`Bearer ${USER_TOKEN}`);
        return HttpResponse.json(envelope({ page: mockPage, users: [mockUser] }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    const result = await makeUserClient().getFollowing({ username: 'gbradley' });
    expect(result.users).toHaveLength(1);
  });
});

describe('follow (User auth only)', () => {
  it('POSTs comma-separated usernames', async () => {
    server.use(
      http.post(`${BASE}users/following.json`, async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        expect(body.get('usernames')).toBe('alice,bob');
        return HttpResponse.json(envelope({ friendships: [mockFriendship] }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    const result = await makeUserClient().follow(['alice', 'bob']);
    expect(result.friendships[0].state).toBe(1);
  });
});

describe('unfollow (User auth only)', () => {
  it('DELETEs with comma-separated usernames in body', async () => {
    server.use(
      http.delete(`${BASE}users/following.json`, async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        expect(body.get('usernames')).toBe('alice');
        return HttpResponse.json(envelope({ friendships: [mockFriendship] }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    const result = await makeUserClient().unfollow(['alice']);
    expect(result.friendships).toHaveLength(1);
  });
});

describe('getFollowers', () => {
  it('returns page + users (App auth)', async () => {
    server.use(
      http.get(`${BASE}users/followers.json`, () =>
        HttpResponse.json(envelope({ page: mockPage, users: [mockUser] }), {
          headers: rateLimitHeaders(),
        }),
      ),
    );
    const result = await makeAppClient().getFollowers();
    expect(result.users[0].username).toBe('gbradley');
  });
});

describe('removeFollower (User auth only)', () => {
  it('DELETEs with usernames', async () => {
    server.use(
      http.delete(`${BASE}users/followers.json`, async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        expect(body.get('usernames')).toBe('spammer');
        return HttpResponse.json(envelope({ friendships: [] }), { headers: rateLimitHeaders() });
      }),
    );
    await makeUserClient().removeFollower(['spammer']);
  });
});

describe('getPendingRequests (User auth only)', () => {
  it('returns page + users', async () => {
    server.use(
      http.get(`${BASE}users/requests/pending.json`, () =>
        HttpResponse.json(envelope({ page: mockPage, users: [mockUser] }), {
          headers: rateLimitHeaders(),
        }),
      ),
    );
    const result = await makeUserClient().getPendingRequests();
    expect(result.users).toHaveLength(1);
  });
});

describe('approvePendingRequests (User auth only)', () => {
  it('PUTs with usernames', async () => {
    server.use(
      http.put(`${BASE}users/requests/pending.json`, async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        expect(body.get('usernames')).toBe('alice,bob');
        return HttpResponse.json(envelope({ friendships: [mockFriendship] }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    const result = await makeUserClient().approvePendingRequests(['alice', 'bob']);
    expect(result.friendships).toHaveLength(1);
  });
});

describe('rejectPendingRequests (User auth only)', () => {
  it('DELETEs with usernames', async () => {
    server.use(
      http.delete(`${BASE}users/requests/pending.json`, async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        expect(body.get('usernames')).toBe('spammer');
        return HttpResponse.json(envelope({ friendships: [] }), { headers: rateLimitHeaders() });
      }),
    );
    await makeUserClient().rejectPendingRequests(['spammer']);
  });
});

describe('getBlockedUsers (User auth only)', () => {
  it('returns page + users', async () => {
    server.use(
      http.get(`${BASE}users/requests/blocked.json`, () =>
        HttpResponse.json(envelope({ page: mockPage, users: [mockUser] }), {
          headers: rateLimitHeaders(),
        }),
      ),
    );
    const result = await makeUserClient().getBlockedUsers();
    expect(result.users).toHaveLength(1);
  });

  it('sends pagination params', async () => {
    server.use(
      http.get(`${BASE}users/requests/blocked.json`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('page_index')).toBe('1');
        return HttpResponse.json(envelope({ page: mockPage, users: [] }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    await makeUserClient().getBlockedUsers({ pageIndex: 1 });
  });
});

describe('unblockUsers (User auth only)', () => {
  it('DELETEs with usernames', async () => {
    server.use(
      http.delete(`${BASE}users/requests/blocked.json`, async ({ request }) => {
        const body = new URLSearchParams(await request.text());
        expect(body.get('usernames')).toBe('alice,bob');
        return HttpResponse.json(envelope({ friendships: [mockFriendship] }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    const result = await makeUserClient().unblockUsers(['alice', 'bob']);
    expect(result.friendships).toHaveLength(1);
  });
});

describe('searchUsers (User auth only)', () => {
  it('sends query param', async () => {
    server.use(
      http.get(`${BASE}users/search.json`, ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get('query')).toBe('@graham');
        return HttpResponse.json(envelope({ page: mockPage, users: [mockUser] }), {
          headers: rateLimitHeaders(),
        });
      }),
    );
    const result = await makeUserClient().searchUsers({ query: '@graham' });
    expect(result.users[0].username).toBe('gbradley');
  });

  it('returns empty users list on no results', async () => {
    server.use(
      http.get(`${BASE}users/search.json`, () =>
        HttpResponse.json(envelope({ page: mockPage, users: [] }), { headers: rateLimitHeaders() }),
      ),
    );
    const result = await makeUserClient().searchUsers({ query: 'nobody' });
    expect(result.users).toHaveLength(0);
  });
});

// ── Shared error + network tests ──────────────────────────────────────────────

describe('rate limiting', () => {
  it('throws BlipfotoError with isRateLimited === true on code-11 (no silent retry)', async () => {
    let callCount = 0;
    server.use(
      http.get(`${BASE}user/profile.json`, () => {
        callCount++;
        return HttpResponse.json(errorEnvelope(11, 'Request limit reached.'), {
          headers: rateLimitHeaders(0, 60),
        });
      }),
    );
    const err = await makeUserClient()
      .getUserProfile()
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BlipfotoError);
    expect((err as BlipfotoError).isRateLimited).toBe(true);
    expect(callCount).toBe(1);
  });
});

describe('network failure', () => {
  it('throws NetworkError when fetch rejects (GET)', async () => {
    server.use(http.get(`${BASE}user/profile.json`, () => HttpResponse.error()));
    await expect(makeUserClient().getUserProfile()).rejects.toBeInstanceOf(NetworkError);
  });

  it('throws NetworkError when fetch rejects (POST)', async () => {
    server.use(http.post(`${BASE}entry/comment.json`, () => HttpResponse.error()));
    await expect(
      makeUserClient().postComment({ entryId: '1', content: 'hi' }),
    ).rejects.toBeInstanceOf(NetworkError);
  });
});
