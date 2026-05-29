# @b-oss/b-api

TypeScript client for the [Blipfoto v4 REST API](https://www.blipfoto.com/developer/api). Private monorepo package — no Node or Electron dependencies; works in Electron main processes and browsers alike.

## Authentication

The API uses two auth modes, both expressed as bearer tokens:

| Mode          | When to use                                    | How to obtain                                     |
| ------------- | ---------------------------------------------- | ------------------------------------------------- |
| **App auth**  | Read-only actions without a user context       | Use your Client ID directly as the access token   |
| **User auth** | Any action on behalf of a user (read or write) | OAuth 2 implicit flow (see `docs/api-general.md`) |

```typescript
import { BlipfotoClient } from '@b-oss/b-api';

const appClient = new BlipfotoClient(clientId); // App auth
const userClient = new BlipfotoClient(userAccessToken); // User auth
```

## Quick start

```typescript
import { BlipfotoClient, BlipfotoError, NetworkError } from '@b-oss/b-api';

const client = new BlipfotoClient('YOUR_CLIENT_ID'); // App auth

try {
  const { page, entries } = await client.getRecentEntries({ pageSize: 10 });
  console.log(`Page ${page.index} — ${entries.length} entries, more: ${page.more}`);
  for (const entry of entries) {
    console.log(entry.date, entry.title, entry.entry_id_str);
  }
} catch (e) {
  if (e instanceof BlipfotoError) {
    console.error(`API error ${e.code}: ${e.message}`);
    if (e.isRateLimited) console.error('Rate limited — back off and retry');
  } else if (e instanceof NetworkError) {
    console.error('Network failure:', e.message);
  }
}
```

## Method groups

| Group             | Methods (examples)                                                                                                                          | Auth                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Config**        | `getCountries`, `getLocales`, `getTerms`                                                                                                    | App + User                               |
| **Entry lists**   | `getJournalEntries`, `getFavoriteEntries`, `getRecentEntries`, `getPopularEntries`, `getNewEntries`, `getFollowingEntries`, `searchEntries` | App + User (following/search: User only) |
| **Entry**         | `getEntry`                                                                                                                                  | App + User                               |
| **Entry CRUD**    | `publishEntry`, `updateEntry`, `deleteEntry`                                                                                                | User only                                |
| **Comments**      | `postComment`, `updateComment`, `deleteComment`                                                                                             | User only                                |
| **Interactions**  | `favoriteEntry`, `starEntry`, `reportEntry`                                                                                                 | User only                                |
| **Calendar**      | `getJournalDay`, `getJournalMonth`                                                                                                          | User only                                |
| **Messages**      | `getRecentComments`, `getRecentNotifications`, `markNotificationsRead`, `getUnreadTotals`                                                   | User only                                |
| **OAuth**         | `verifyToken`, `exchangeCode`, `loginWithPassword`, `revokeToken`                                                                           | Mixed                                    |
| **User profile**  | `getUserProfile`, `getUserAwards`, `getUserSettings`, `updateUserSettings`                                                                  | App + User / User only                   |
| **Notifications** | `getNotificationSettings`, `updateNotificationSettings`                                                                                     | User only                                |
| **Social**        | `getFollowing`, `getFollowers`, `follow`, `unfollow`, `searchUsers`, …                                                                      | App + User / User only                   |

## Error handling

```typescript
import { BlipfotoError, NetworkError } from '@b-oss/b-api';

try {
  await client.publishEntry({ image: blob });
} catch (e) {
  if (e instanceof BlipfotoError) {
    // e.code    — numeric Blipfoto error code (see docs/api-general.md)
    // e.message — human-readable message from the API
    if (e.isRateLimited) {
      /* code 11 — back off */
    }
    if (e.isTokenInvalid) {
      /* code 50/51 — re-authenticate */
    }
  } else if (e instanceof NetworkError) {
    // Transport failure (fetch threw) — e.cause holds the original error
  }
}
```

## Rate limits

Every call updates `client.rateLimitInfo`:

```typescript
const info = client.rateLimitInfo; // null before first call
// { limit: number; remaining: number; resetInSeconds: number }
```

A value of `-1` means the request is not subject to rate limits. Error code `11` triggers `isRateLimited === true` on `BlipfotoError`.

## Image uploads

`publishEntry`, `updateEntry`, and `updateUserSettings` accept a `Blob` for binary image data — a web-standard type available in Node 18+ and browsers. In Electron main:

```typescript
import fs from 'node:fs/promises';
const blob = new Blob([await fs.readFile(imagePath)], { type: 'image/jpeg' });
await client.publishEntry({ image: blob, title: 'My entry' });
```

## Type conventions

- All 64-bit IDs appear as both an integer (`entry_id`) and a string (`entry_id_str`). **Always use the `_str` variant** — the integer form loses precision in JavaScript.
- Fields that support BBCode markup always have a paired `_html` variant containing rendered HTML (e.g. `description` / `description_html`).

## Full API reference

- **Human docs:** https://www.blipfoto.com/developer/api
- **Local reference:** [`docs/api-reference.md`](docs/api-reference.md) and [`docs/api-general.md`](docs/api-general.md)

## Contributing / Testing

Unit tests use [MSW](https://mswjs.io/) to mock all HTTP calls — no credentials required. See [`docs/integration-testing.md`](docs/integration-testing.md) for guidance on running tests against the real Blipfoto API.
