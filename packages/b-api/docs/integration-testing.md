# Integration Testing Guide

The unit tests in `src/__tests__/client.test.ts` use [MSW](https://mswjs.io/) to intercept all
`fetch` calls and require no credentials. This document covers how to run tests against the
**real Blipfoto API** — useful for verifying new endpoints or diagnosing API changes.

---

## Overview

Integration tests hit real Blipfoto servers. They require:

1. A dedicated test Blipfoto account (the "primary" journal account)
2. A second Blipfoto account (for social tests — follow, comment, etc.)
3. Bearer tokens for both accounts stored in environment variables

Unit tests skip when env vars are absent; integration tests similarly guard themselves:

```typescript
const token = process.env.BLIPFOTO_TEST_TOKEN;
if (!token) {
  it.skip('BLIPFOTO_TEST_TOKEN not set');
}
```

---

## Credentials

Obtain tokens via `POST /oauth/token` (password grant) using `loginWithPassword()`, or via the
OAuth 2.0 implicit flow in b-ark. Store them in a `.env.test.local` file (gitignored):

```
BLIPFOTO_TEST_TOKEN=<primary account bearer token>
BLIPFOTO_TEST_TOKEN_2=<secondary account bearer token>
```

---

## Test journal setup

Create a dedicated Blipfoto account to use as the primary test journal. The following
characteristics make it maximally useful for exercising the full API surface:

| Characteristic                                                  | Rationale                                                                                                      |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **~20 entries, spanning ≥ 2 calendar years**                    | Enables 2-page pagination (default `page_size=10`) and populates `year_ago` / `year_ahead` in `return_related` |
| **≥ 2 complete calendar months with entries**                   | `getJournalMonth` returns a meaningful non-empty grid                                                          |
| **At least 1 entry with BBCode in description**                 | Exercises `description_html` rendering; compare `description` vs `description_html`                            |
| **At least 1 entry with tags**                                  | Tests the `tags` array in details                                                                              |
| **At least 1 entry with GPS location**                          | Tests the `location` object on `BlipEntryStub` and `searchEntries` radial filter                               |
| **At least 1 entry with real or manually supplied EXIF data**   | Tests `return_metadata` fields (Make, Model, ISO, etc.)                                                        |
| **At least 1 entry with 3+ comments, one of which has a reply** | Tests `return_comments` + `include_replies` nesting                                                            |
| **Journal set to public (not private)**                         | App-auth reads work without a user token                                                                       |
| **A second account that follows the primary**                   | Tests `getFollowers`, `getFollowing`, and `getFollowingEntries`                                                |

### Known entry IDs

Document stable `entry_id_str` values in `src/__tests__/fixtures.ts` so tests can assert
against specific entries without querying first:

```typescript
// src/__tests__/fixtures.ts
export const TEST_USERNAME = 'blipfoto-test-account';
export const ENTRY_WITH_COMMENTS = '1234567890123456789';
export const ENTRY_WITH_LOCATION = '9876543210987654321';
export const ENTRY_WITH_EXIF = '1111111111111111111';
```

---

## Write-operation testing

Write tests should create and clean up their own resources in the same test:

```typescript
// Post a comment, assert, then delete it
const { comment } = await client.postComment({ entryId: ENTRY_WITH_COMMENTS, content: 'Test' });
expect(comment.content).toBe('Test');
await client.deleteComment(comment.comment_id_str);
```

### One-way interactions

`favoriteEntry` and `starEntry` have **no reverse endpoint** in the API. Integration tests for
these should either:

- Use a dedicated "sacrificial" entry that will always be starred/favorited (idempotent if already
  done), or
- Accept that the test is one-way and creates permanent state on the account.

---

## Rate limits

The Blipfoto API allows 200 requests per 15-minute window per access token. Integration test suites
should check `client.rateLimitInfo.remaining` between test groups and pause if needed to avoid
exhausting the limit mid-suite.
