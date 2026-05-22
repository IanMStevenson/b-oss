# Prompt 2 — `packages/blipfoto-api`

## Context

You are building **b-oss**, an open-source Electron desktop app for backing up Blipfoto photography journals. The monorepo was scaffolded in Prompt 1. You are now implementing the `blipfoto-api` package — a typed, dependency-free HTTP client for the Blipfoto REST API.

This package has **no Node.js or Electron dependencies**. It uses `globalThis.fetch` (available natively in Node 18+ and all modern browsers) so it can run in the Electron main process, renderer process, and in tests without a special environment.

---

## Package location

`packages/blipfoto-api/`

The stub `src/index.ts` was created in Prompt 1. Replace its contents entirely.

---

## API facts (do not invent these)

- **Base URL:** `https://api.blipfoto.com/4/`
- **Auth header:** `Authorization: Bearer <access_token>`
- **Response envelope:** every response is `{ version: number, error: ApiError | null, data: T | null }`
- **Rate limit headers on every response:**
  - `X-RateLimit-Limit` — total requests in the 15-minute window
  - `X-RateLimit-Remaining` — requests remaining in current window
  - `X-RateLimit-Reset` — **seconds remaining** until the next window resets (not epoch)
  - A value of `-1` means the request is not subject to rate limits
- **Rate limit error:** code `11`, message `"Request limit reached."`
- **Token invalid:** code `51`, message `"The user access token is invalid."`
- **Token missing:** code `50`, message `"The user access token is missing."`
- **64-bit IDs:** every `*_id` integer property has a `*_id_str` string companion — **always use the `_str` variant**; never touch the bare integer property

---

## What to build

### 1. `src/types.ts` — shared type definitions

```typescript
// Raw API envelope
export interface ApiEnvelope<T> {
  version: number;
  error: { object: 'Error'; code: number; message: string } | null;
  data: T | null;
}

// Rate limit metadata extracted from response headers
export interface RateLimitInfo {
  limit: number;       // X-RateLimit-Limit
  remaining: number;   // X-RateLimit-Remaining
  resetInSeconds: number; // X-RateLimit-Reset
}

// Blipfoto User (basic)
export interface BlipUser {
  username: string;
  avatar_url: string;
  icons: Array<{ icon_id_str: string; icon_url: string }>;
}

// User profile details (when return_details=1)
export interface BlipUserDetails {
  journal_title: string;
  biography: string;
  biography_html: string;
  country_code: string;
  entry_total: number;
  member: 0 | 1;
  privacy: 0 | 1;
}

// Entry stub (from journal/entries list)
export interface BlipEntryStub {
  entry_id_str: string;   // always use _str
  date: string;           // YYYY-MM-DD
  date_stamp: number;     // epoch
  title: string;
  username: string;
  location: { lat: number; lon: number } | null;
  thumbnail_url: string;
  image_url: string;
}

// Entry detail — from return_details=1
export interface BlipEntryDetails {
  journal_title: string;
  description: string;
  description_html: string;
  tags: string[];
  views: { total: number };
  stars: { total: number; starred: 0 | 1 };
  favorites: { total: number; favorited: 0 | 1 };
}

// Entry metadata (EXIF) — from return_metadata=1
export interface BlipEntryMetadata {
  Make: string | null;
  Model: string | null;
  ExposureTime: string | null;
  FNumber: string | null;
  FocalLength: string | null;
  ISO: string | null;
  camera: string | null;
}

// Comment object
export interface BlipComment {
  comment_id_str: string;
  parent_id_str: string | null;
  entry_id_str: string;
  thumbnail_url: string;
  content: string;
  content_html: string;
  commenter: Pick<BlipUser, 'username' | 'avatar_url'>;
  replies: BlipComment[] | null;
}

// Comments container — from return_comments=1
export interface BlipEntryComments {
  total: number;
  list: BlipComment[];
}

// Image URLs — from return_image_urls=1
export interface BlipImageUrls {
  lores: string | null;
  stdres: string | null;
  hires: string | null;
  original: string | null;
}

// Full entry response (all optional expansions combined)
export interface BlipEntryFull extends BlipEntryStub {
  details?: BlipEntryDetails;
  metadata?: BlipEntryMetadata;
  comments?: BlipEntryComments;
  image_urls?: BlipImageUrls;
}

// Pagination descriptor
export interface BlipPage {
  index: number;
  size: number;
  more: 0 | 1;
}

// User profile response
export interface UserProfileResponse {
  user: BlipUser;
  visibility: 0 | 1;
  details?: BlipUserDetails | null;
}

// Journal entries response
export interface JournalEntriesResponse {
  page: BlipPage;
  entries: BlipEntryStub[];
}

// Single entry response
export interface EntryResponse {
  entry: BlipEntryFull;
}
```

### 2. `src/errors.ts` — typed error class

```typescript
export class BlipfotoError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'BlipfotoError';
  }

  /** Token is invalid or expired — caller should prompt re-auth */
  get isTokenInvalid(): boolean {
    return this.code === 51 || this.code === 50;
  }

  /** Rate limit hit — caller should wait and retry */
  get isRateLimited(): boolean {
    return this.code === 11;
  }
}

export class NetworkError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}
```

### 3. `src/client.ts` — the HTTP client

Implement a `BlipfotoClient` class. It should:

- Accept `accessToken: string` and an optional `baseUrl: string` (defaults to `'https://api.blipfoto.com/4/'`) in the constructor
- Have a private `request<T>` method that:
  1. Builds the URL (appending `.json` to the path, then query params)
  2. Sets the `Authorization: Bearer <token>` header
  3. Calls `globalThis.fetch()`
  4. Parses the response body as JSON
  5. Extracts rate limit headers from the response and stores them as `this.lastRateLimit: RateLimitInfo`
  6. If `envelope.error` is non-null, throws `BlipfotoError(code, message)`
  7. If fetch itself throws (network failure), wraps and re-throws as `NetworkError`
  8. Returns `envelope.data as T`
- Have a private `requestWithRateLimitRetry<T>` method that:
  1. Calls `request<T>`
  2. If a `BlipfotoError` with `isRateLimited === true` is caught, sleeps for `(lastRateLimit.resetInSeconds + 1) * 1000` ms, then retries **once**
  3. On the second failure, re-throws

Implement a `sleep(ms: number)` helper: `return new Promise(resolve => setTimeout(resolve, ms))`.

#### Public methods

**`getUserProfile(options?: { username?: string; returnDetails?: boolean }): Promise<UserProfileResponse>`**

- `GET user/profile`
- Params: `username` (omit for authenticated user), `return_details: 1` if `returnDetails` is true
- Uses `requestWithRateLimitRetry`

**`getJournalEntries(options?: { username?: string; pageIndex?: number; pageSize?: number }): Promise<JournalEntriesResponse>`**

- `GET entries/journal`
- Params: `username`, `page_index`, `page_size` (all optional)
- Uses `requestWithRateLimitRetry`

**`getEntry(entryId: string, options?: { returnDetails?: boolean; returnMetadata?: boolean; returnComments?: boolean; includeReplies?: boolean; returnImageUrls?: boolean }): Promise<EntryResponse>`**

- `GET entry`
- Always sends `entry_id: entryId` (the _str value — treat as opaque string param)
- Maps boolean options to `return_details=1`, `return_metadata=1`, `return_comments=1`, `include_replies=1`, `return_image_urls=1`
- Uses `requestWithRateLimitRetry`

**`verifyToken(clientId: string): Promise<{ username: string }>`**

- `GET oauth/token` with `client_id: clientId`
- Returns the token username — useful for confirming the token was issued to b-ark
- Uses plain `request` (not retry — if rate limited here something is very wrong)

**Getter: `get rateLimitInfo(): RateLimitInfo | null`** — returns `this.lastRateLimit` (initially `null`)

#### URL building

Build query strings from a `Record<string, string | number | undefined>`, skipping `undefined` values. Append the serialised params as a standard querystring. Example:

```
GET https://api.blipfoto.com/4/entries/journal.json?username=gbradley&page_index=0&page_size=100
```

### 4. `src/index.ts` — barrel export

Re-export everything from `types.ts`, `errors.ts`, and `client.ts`:

```typescript
export * from './types.js';
export * from './errors.js';
export * from './client.js';
```

---

## Tests

Location: `packages/blipfoto-api/src/__tests__/client.test.ts`

Use **Vitest** and **msw** (`msw/node` handler) to mock the Blipfoto API. Do not make real network calls.

### Test setup

```typescript
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
```

### Required test cases

**`getUserProfile`**

1. Returns parsed user and details when `returnDetails: true`
2. Omits details object when `returnDetails` not set
3. Throws `BlipfotoError` with `isTokenInvalid === true` on error code 51
4. Updates `rateLimitInfo` after a successful call

**`getJournalEntries`**

5. Returns page + entries array
6. Sends correct `page_index` and `page_size` query params
7. Handles `more: 0` (last page)

**`getEntry`**

8. Returns entry with details, metadata, comments, and image_urls when all options enabled
9. Returns bare entry stub when no options set
10. Maps `includeReplies` correctly (only sent when `returnComments` is also true)

**Rate limiting**

11. When first request returns error code 11 and second succeeds: client sleeps (mock `setTimeout`) and retries — the successful data is returned
12. When both requests return error 11: `BlipfotoError` with `isRateLimited === true` is thrown

Use `vi.useFakeTimers()` / `vi.runAllTimersAsync()` for the sleep in test cases 11 and 12.

**`verifyToken`**

13. Returns username from token object
14. Throws `BlipfotoError` on error code 52 (invalid client)

**Network failure**

15. When `fetch` rejects, throws `NetworkError`

---

## package.json additions

Ensure `packages/blipfoto-api/package.json` has:

```json
{
  "devDependencies": {
    "msw": "^2.0.0"
  }
}
```

`msw` is a dev dependency — it is not bundled into the package. The package itself has zero runtime dependencies.

---

## Acceptance criteria

- [ ] `npm run typecheck` passes with zero errors from this package
- [ ] `npm test --workspace=packages/blipfoto-api` — all 15 tests pass
- [ ] `BlipfotoClient` can be imported with no side effects
- [ ] No `import ... from 'node:*'` or `import ... from 'electron'` anywhere in `src/`
- [ ] Every place an `*_id` is read from an API response uses the `*_id_str` variant
- [ ] Rate limit headers are parsed on every response and stored in `lastRateLimit`
- [ ] `BlipfotoError.isTokenInvalid` is `true` for codes 50 and 51
- [ ] `BlipfotoError.isRateLimited` is `true` for code 11
- [ ] Sleep-and-retry fires exactly once on a rate limit hit, not in an infinite loop
- [ ] `src/index.ts` is a clean barrel — no logic, only re-exports

## Do NOT

- Do not use `axios`, `node-fetch`, or any HTTP library — only `globalThis.fetch`
- Do not reference `window`, `document`, or any browser-only global other than `fetch` and `setTimeout`
- Do not add a `"main"` or `"browser"` field pointing to a compiled file — this package is consumed as TypeScript source by other workspaces via the `paths` alias set up in Prompt 1
- Do not implement write endpoints (POST entry, PUT entry, etc.) — b-oss is read-only
- Do not add retry logic for errors other than code 11 (rate limit)
- Do not log to console — callers handle logging
- Do not catch and swallow errors silently anywhere
