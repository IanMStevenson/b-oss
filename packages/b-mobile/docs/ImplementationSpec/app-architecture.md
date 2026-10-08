# b-mobile application architecture

How the b-mobile Capacitor/Ionic Android app is built, for agents fixing or maintaining it.
Verified against the code on 2026-10-08; where this document and the code disagree, the code wins.
What the app does (screens `SCR-NN`, flows `FLW-NN`, rules) is in [`../BEHAVIOUR.md`](../BEHAVIOUR.md).
Section numbers are stable because source comments cite them; gaps are deliberate.

## 2. Repository and package layout

b-mobile is an npm workspace in the b-oss monorepo, inheriting the root TypeScript, ESLint,
Prettier, Vitest and versioning setup. It depends on three workspace packages only, and nothing
depends on it:

- **`b-api`**: the Blipfoto HTTP client ([docs](../../../b-api/docs/)). Aliased to its
  `src/index.ts` in `vite.config.ts`, because its `main` is a compiled `dist/` that a workspace
  build would not recompile.
- **`b-view`**: source-agnostic, prop-driven components (`ThumbnailGrid`, `EntryDetail`,
  `Lightbox`, `BBCodeText`, `BBCodeEditor`/`BBCodeField`, `CommentComposer`…), consumed from source.
- **`b-visual`**: design tokens (`tokens.css`, `tokens.ts`, fonts) and `docs/style-guide.md`.
- The notification service is the separate `b-push` package (§11). The app is one package, not a
  shell plus UI kit as on desktop/Chrome; the platform boundary is an internal rule instead (§4).

```
packages/b-mobile/
  android/   native project, checked in (§17); no ios/ yet
  scripts/   screenshot helpers, stub-api.mjs (stub Blipfoto API for the dev proxy)
  src/  app/ (AppShell, OverlayProvider, hardwareBack, routes/)  screens/SCR-NN-name/
        components/  flows/ (plain modules named by job)  state/ (§6)  data/ (§7)
        platform/ (§4)  strings/ (deck.ts, t())  styles/ (theme.css, globals.css)
        diagnostics/ (feedProbe.ts, inert unless VITE_FEED_PROBE=1)
```

**Build:** Vite + React 19 + TypeScript strict, as in `b-view`. Plain global CSS over b-visual
tokens (no CSS Modules of its own, no Tailwind or CSS-in-JS). The `dev`/`build` scripts run the root
`scripts/copy-icons.mjs` and `scripts/version.mjs` first; `__APP_VERSION__`/`__RELEASE__` come from
`version.generated.json`. `envDir` is the repo root (§18). The Capacitor CLI (`npx cap sync`,
`npx cap run android`) drives the native build.

## 3. Runtime stack

Capacitor 8 · React 19 · Ionic React 9 + `@ionic/react-router` 9 · `react-router(-dom)` **6**
(Ionic 9 requires `>=6.4 <7`; don't move to 7 until Ionic supports it) · Zustand 5 · MapLibre GL JS
(§13) · `@bbob/react` and ProseMirror via b-view (§14) · `react-easy-crop` (§15) ·
`react-zoom-pan-pinch` (full-screen photo) · `lucide-react` icons · Vitest + Testing Library + jsdom.
Capacitor plugins: `app`, `browser`, `camera`, `filesystem`, `file-transfer`, `geolocation`,
`local-notifications`, `preferences`, `push-notifications`, `@aparajita/capacitor-secure-storage`;
`CapacitorHttp` and `SystemBars` come from `@capacitor/core`. Six local Java plugins (§17).
`@capacitor/preferences` is for non-sensitive data only, never tokens.

## 4. The platform boundary

**`@capacitor/*` imports live in `src/platform/` only**, enforced by `no-restricted-imports` in the
root `eslint.config.cjs`. Screens, flows and state stay testable in jsdom with platform mocked,
`vite dev` stays usable (modules have web fallbacks or are no-ops off native), and plugin churn is
confined to one file.

One module per capability, exposing an app-shaped API: `secureStorage` (§8), `http` and `upload`
(§7, §9), `imageCache` + `imageIntegrity` (§10), `push` (§11), `localNotifications` (§12),
`camera` (§15), `geolocation` + `mapTiles` (§13), `browser` + `embeddedAuth` (§8), `deepLinks` +
`shareIntent` + `blipfotoLinks` (§16), `mediaSave` (save to gallery), `accessibility` (§20),
`systemBars`, `prefs`, `appState`. Pure Web-API helpers (`data/binary.ts`, `data/multipartBody.ts`, `data/imageCrop.ts`) live in
`data/`. MapLibre is not a Capacitor plugin, so `MapScreen` imports it directly.

## 5. Navigation and routing

**Ionic shell; React Router confined.** `IonApp`, `IonMenu`, one `IonRouterOutlet`, `IonPage`,
`IonAlert`, `IonActionSheet` supply hardware back, safe areas, keyboard handling and accessible
dialogs; b-view and app components render inside pages.

- `react-router` may be imported only in `src/app/routes/**` and `app/AppShell.tsx` (ESLint; tests
  exempt). Screens use `useAppNavigate()`; flows take an injected `push` callback.
- `styles/theme.css` maps b-visual tokens onto Ionic's `--ion-*` variables.
- `IonMenu` (`AppShell.tsx`): New entry (write accounts), Browse, Search, Map, My profile /
  Notifications / Comments (signed in), Settings, Help & about, Accounts, Hidden members (signed
  in), Sign in (signed out). No `IonTabs`.
- `components/AppHeader.tsx`: title bar, menu button, quick actions, and `AccountIndicator` (only
  with two or more stored accounts).
- `app/hardwareBack.ts`: Android Back does nothing on Browse; elsewhere Ionic's default applies.

### Navigation model: no view stack, resume cache instead

The route table sits inside one catch-all `<Route path="/*">` in the outlet (`renderAppRoutes()`,
`app/routes/AppRoutes.tsx`), so Ionic sees one view item and **a screen unmounts when you navigate
away**. Ionic 9's outlet would otherwise keep one mounted view per route it can see among its
direct children; don't expose the real routes to it. Back is made to feel right by remembering state.

- **The inner `<Routes>` is keyed by `activeAccountId`**: switching account rebuilds the screen.
- **Back = history.** `IonBackButton` pops; `backHref` is only the fallback with no history (deep
  link, notification tap). Sign In shows Back instead of the menu button when an account exists.
- **Entry pages never stack**: swiping between entries uses `replace`.
- **Settings chains**: Accounts, Hidden members and each section go Back to Settings.
- **In-screen tabs are state, not routes.** Browse (`SCR-02`) has an `IonSegment` of seven feeds:
  Recent, Following and Me (signed in), Popular, Milestones, New Blippers, Nearby. Only the active
  tab is mounted, keyed by account + tab; choosing a tab starts it at page 1. Search, Tag entries
  and Profile work the same way.
- **Resume cache** (`data/resumeCache.ts`): in memory, 10-minute TTL, per-account keys where the
  data is.

| Screen                                                             | Remembered on return                                | Mechanism                                                       |
| ------------------------------------------------------------------ | --------------------------------------------------- | --------------------------------------------------------------- |
| Browse                                                             | tab, page, grid position                            | `usePagedResource` `resumeKey` + `ThumbnailGrid` top-left index |
| Tag entries, Profile                                               | tab, visited tabs, grid pages                       | same                                                            |
| Search                                                             | scope, mode, query, results, scroll                 | `search:${scope}:ui` + per-tab keys, `useScrollResume`          |
| Map                                                                | camera centre + zoom                                | `map:view`                                                      |
| Followers / Following                                              | loaded window + page                                | `people:${acct}:${mode}:${username}`                            |
| Entry                                                              | scroll position                                     | `useScrollResume('entry:<id>')`                                 |
| Inboxes, Pending/Refused, Awards, Settings, Accounts, Hidden, Help | nothing: refetch (opening inboxes marks items read) | —                                                               |
| Compose / Edit / Description / Location                            | own unsaved-changes guards                          | —                                                               |

### Routes

`app/routes/AppRoutes.tsx` is the table (lowercase, hyphenated; params are the string form of an
id; `/` redirects to `/browse`). Not obvious from the paths:

- **Write-gated** (`WriteGuardRoute`): `/compose`, `/entry/:id/edit`, `/entry/:id/report`.
  **Account-gated** (`AccountGuardRoute`): `/notifications`, `/comments` (push targets).
- **Lazy-loaded:** `/map`, `/compose/location` (MapLibre), `/compose/details` (react-easy-crop).
- **Query/state:** `/map?entry=<id>` (focused mode); `/accounts?reauth=<accountId>` (opens that
  account's sign-in-again dialog); `/entry/:id` takes router state `replyToCommentId`; `/report`
  takes the target user/comment via router state.
- Comments are composed inline on `/entry/:id` (there is no `SCR-15` route).
  `/compose/description` (`SCR-11`) is now the Biography editor only. Settings sections:
  `general`, `journal`, `profile`, `notifications`, `app`, `browsing`; Help also has `/help/:section`.

**Overlays are not routes.** The upgrade prompt, first-run explainer and account switcher belong
to `app/OverlayProvider.tsx` (`useOverlay()`); per-screen confirmations are local `IonAlert`s.

**Gating** is done once, in the router:

- **`WriteGuardRoute`** reads `useCanWrite()` (§6). Anonymous → `signInGated()` (read-write round),
  resuming on success, back on failure. Read-only → an `IonAlert` upgrade prompt (decline goes
  back, confirm goes to `/accounts`). This covers deep links and share intents too.
- **`AccountGuardRoute`** wraps the inboxes, which a push tap can reach while signed out:
  `signInGated()`, else redirect to `/browse`.

## 6. State management

**No server-cache library**: displayed data is never cached (only images, §10). `src/data/` has:

- **`useResource`**: `loading | loaded | empty | error` with `retry()`.
- **`usePagedResource`**: adds `loadMore`, `refresh`, `seekTo`/`loadBefore`, an optional
  `resumeKey` (§5), and detects the API's page-index clamp (`wasClamped`, §7).
- Both supersede rather than abort in-flight requests (request-id ref, §7).

**Zustand** because the upload runner, push handlers, deep links and reminders are not React and
use `getState()`/`setState()`.

| Store                     | Holds                                                                                                                                                         | Persisted             |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `accountsStore`           | accounts (id, username, avatar, `appTokenScope`, `hasServiceToken`, b-push registration id/status, push stream flags, `lastAppTokenScope`), `activeAccountId` | `prefs`, never tokens |
| `hiddenMembersStore`      | per-account hidden usernames, device-local                                                                                                                    | `prefs`               |
| `uploadQueueStore`        | the upload queue (§9)                                                                                                                                         | `prefs` + files       |
| `devicePrefsStore`        | reactions confirm, per-account reminders, `uploadFullSize`, `openBlipfotoLinksInApp`, polling interval, explainer seen, grid/display prefs                    | `prefs`               |
| `composeDraftStore`       | the publish/edit draft (`mode`), surviving `SCR-11`/`SCR-12` and rotation                                                                                     | memory                |
| `notificationCountsStore` | inbox badge counts for the active account                                                                                                                     | memory                |

`state/authReady.ts` resolves once the active account is settled for this launch (hydration plus
the dev `VITE_DEV_TOKEN` seed); `getClient()` awaits it. Unsent comment text is kept by
`data/commentDrafts.ts`. **Token possession is state.** `appTokenScope` is `'read' | 'read,write' | null` (null = no app
token, needs re-auth). Tokens stay in secure storage (§8). **`useCanWrite()`** (active account's
`appTokenScope === 'read,write'`) is the only write gate. `accountsFlow.handleForcedLogout(id, purpose)` clears a token and its flag together.

## 7. Networking and the `b-api` seams

`new BlipfotoClient(token, baseUrl, fetchImpl?, multipartImpl?)` has two seams:

1. **`fetchImpl`**: b-mobile passes `platform/http.ts#platformFetch` (`CapacitorHttp.request()`).
   Required on device: Blipfoto serves no CORS headers, so WebView `fetch()` is blocked. Off native
   it is plain `fetch` through the dev proxy (§19).
2. **`multipartImpl`**: used by `mutateMultipart()` (publish, edit, avatar). Files are a
   `FileSource`, `{ blob }` or `{ path, mimeType }`. Off native `getMultipartImpl()` is `undefined`
   and b-api's `FormData` path runs.

**Native multipart** (`platform/upload.ts`). `CapacitorHttp` mishandles `FormData`, and
`FileTransfer.uploadFile()` sends a single part (`params` is the query string, and the API ignores
entry fields there on a multipart `POST`/`PUT`). So the app builds the whole body
(`data/multipartBody.ts`) into a temp file in `Directory.Cache` and uploads that with an
**explicit** `Content-Type: multipart/form-data; boundary=…`, which makes the plugin stream it
unchanged. `uploadFile()` rejects on HTTP error statuses; a rejection carrying `httpStatus` and
`body` is returned as a normal response so b-api can parse Blipfoto's error envelope. Don't move
fields to `params`: iOS also never puts them in a multipart body. Not yet exercised on a device
against the live API (b-oss#336).

**Cancellation.** `CapacitorHttp` cannot abort. Hooks and `MapScreen` keep a request id and ignore
stale responses; superseded requests still complete and still use rate-limit allowance, so the map
(450 ms) and search are debounced (`data/useDebounce.ts`).

### The client factory (`data/client.ts`)

- **`getClient(purpose = 'app')`** awaits `authReady`, then uses the active account's token, or
  the anonymous client (bearer = `VITE_BLIPFOTO_CLIENT_ID`) if there is no account or token.
  Never a credential-less request.
- **`withRateLimitFallback(fn)`**: identity-independent reads (Recent/Popular/Nearby, tags, search,
  entries, map) retry once anonymously when the account's token is rate limited (limits are per
  token). Never for identity-bound calls or writes.
- **`getClientForToken(token)`**: verifying a fresh token; revoking a specific token.
- **`getClientForAccount(id, purpose)`**: the upload runner (keeps its account across switches;
  throws if there is no token).
- App-token responses with error code 50/51 call `accountsFlow`'s registered handler
  (`setAppTokenRejectedHandler`), putting the account into needs-reauth.
- Base URL: `${origin}/api/blipfoto/4/` in desktop dev, else `https://api.blipfoto.com/4/`.

### Error mapping (`data/errors.ts`)

`mapApiError(error)` → `forced-logout` (`isTokenInvalid`), `rate-limited`, `upgrade-prompt` (code
16; should be unreachable, so it signals a write-gate bug), `validation` (a `VALIDATION_CODES`
copy key `ERR.<code>.<name>`; the screen keeps the input), `transport` (`NetworkError`; the only
retried outcome, §9) or `message` (`HttpError` and everything else). Codes 221–223 (already
starred/favourited, favourite quota) are handled in `flows/reactionsFlow.ts` first.
`describeError()` renders an outcome; `describeUploadError()` adds status, body excerpt or cause.

### Blipfoto API facts learned on-device (observed behaviour)

- Errors come inside a normal 200 envelope; the HTTP status says nothing.
- `journal/month` accepts `username`; the response is nested `{ month: { days } }` (b-oss#169).
- `entries/journal` clamps `page_index` to 200; journal pages are 100 entries (b-oss#153).
- `actions.comment === 0` means comments are off for that journal.
- `user/awards.json` returns the whole catalogue; unearned awards have `added_stamp: null`.
- Fetching the comments list marks **all** unread comments read; fetching notifications marks the
  returned rows read (§11).

## 8. Authentication and secure token storage

**The OAuth round** (`flows/oauthRound.ts`): implicit grant, redirect `bmobile://oauth/` (§16).

1. `buildImplicitGrantUrl()` with `scope` typed `'read' | 'read,write'`; never built from config or
   input. A fresh random `state` per round, in memory only.
2. Opened in the system browser (Custom Tabs, `platform/browser.ts`) so an existing Blipfoto session
   and password manager work, **or** with `useEmbedded` in `EmbeddedAuthActivity`, a WebView with
   cookies cleared to force a fresh login. `accountsFlow` uses the embedded one when more than one
   account is stored.
3. The round's own `onAppUrlOpen` listener catches the redirect, closes the browser, and
   `parseImplicitGrantCallback()` extracts token, `state` and username. Closing the browser rejects
   with `OAuthCancelledError`.
4. **A `state` mismatch is discarded silently**, never shown as an error.
5. `verifyToken()` (`GET oauth/token`) returns the owner and **granted** scope, which (not the
   requested scope) sets `appTokenScope`.
6. `accountsFlow` owner-checks: a token for the wrong account is revoked (unless already held) and
   `AccountMismatchError` says whose it was.

Read-write accounts wanting notifications run a second, read-only round for the `service` token
b-push uses, after push permission is confirmed (§11). For a read-only account the app and service
tokens are the same credential.

**Secure storage** (`platform/secureStorage.ts`, Keystore; `localStorage` fallback in a desktop
browser). Keys `token:<accountId>:app`, `token:<accountId>:service`,
`push-registration-secret:<accountId>`. Tokens are read at request time and never reach a store,
React state, `prefs`, logs or error messages. Treat a failed read as "no token" (re-auth).
`capacitor.config.ts` sets `loggingBehavior: 'none'` because the default logs every bridge call's
arguments, including `Authorization` headers and secrets, to logcat (b-oss#241).

**Backup:** `android:allowBackup="false"`; nothing on the device is worth backing up.
**Revocation:** `DELETE oauth/token` must be authenticated with the token being revoked
(`getClientForToken`); mode changes revoke each surplus token.

## 9. The durable upload queue

`state/uploadQueueStore.ts` + `flows/uploadQueueRunner.ts` (a plain module).

- **Enqueue copies the photo** to `Directory.Data/uploads/`; picker URIs are temporary grants.
- **Item** (`UploadQueueItem`): account, `kind: 'publish' | 'edit'`, optional `entryId`, copied
  `filePath` (none for a details-only edit), `fields`, `status`, `attempts`, `nextAttemptAt`,
  `error`. Status is `waiting | uploading | uploaded | failed` (`SCR-14`'s four states).
- **Serial**, one item at a time, via `getClientForAccount()` and `publishEntry()`/`updateEntry()`.
- **Retry** only `transport`: backoff 5 s, 15 s, 45 s, 2 min, then 5 min; `failed` after 6
  attempts. `forced-logout` runs `handleForcedLogout` and fails the item; anything else fails at once.
- **Account removal** cancels its items. **Success** deletes the copied file and reschedules that
  account's reminder to skip today (§12).
- **Wakes** on launch, on enqueue, and on a timer for the next retry; no connectivity listener.

**Limitation:** nothing uploads while the process is dead. On launch, `uploading` items reset to
`waiting`. No foreground service, no ongoing upload notification (the `uploads` channel is unused),
no byte-level progress.

## 10. The image cache

The rule: images only, **15 minutes, keyed by URL, app-wide, on disk, bounded by TTL alone, no
size cap, not an offline mode.** `platform/imageCache.ts` + `components/CachedImage.tsx`:

- **Key:** SHA-256 of the URL (32 hex chars) under `Directory.Cache/image-cache/`, which the OS can
  evict, so no size cap is needed. Fresh = mtime within 15 minutes.
- **Download:** `FileTransfer.downloadFile()` (native, no CORS) to `<path>.tmp`, checked by
  `imageIntegrity.ts` (JPEG SOI…EOI, PNG IEND, GIF trailer, WebP RIFF length), then renamed in,
  so readers never see a partial file (b-oss#185). Concurrent callers share one download per URL.
- **Failure:** an incomplete download is retried once, then the remote URL is shown uncached; a
  download error also falls back to the remote URL. A cache failure never becomes a broken image.
  Rejections log `[imgcache]` (grep logcat). `invalidateImage(url)` drops a bad entry.
- **No expiry sweep yet** (TODO in the file): stale files are replaced on next request or evicted
  by the OS. **Web:** `resolveImage()` returns the URL unchanged.
- `CachedImage`: placeholder while resolving, `loading="lazy"` by default, one invalidate-and-retry
  on load error, then b-view's image-glyph placeholder. `ThumbnailGrid`/`EntryDetail` call
  `resolveImage` through their `resolveAsset` prop.

## 11. Push notifications, client side

Server side (polling, FCM sending, registration API):
[`../../../b-push/ARCHITECTURE.md`](../../../b-push/ARCHITECTURE.md). This is the app's half:
`@capacitor/push-notifications` over FCM. **`google-services.json` is gitignored**; without it the
Gradle google-services plugin is skipped and push is unavailable.

- **Availability first.** `register()` kills the process natively on a build without Firebase
  credentials. `push.ts#isPushAvailable()` (via `PushAvailabilityPlugin`) gates every entry point.
- **Permission:** `prompt | prompt-with-rationale | granted | denied`, read live every time; a
  refusal is not remembered as a state. `pushFlow.ensurePushPermission()` runs **before** any
  read-token sign-in round.
- **Registration** (`flows/pushFlow.ts`, `data/pushService.ts`): `POST /v1/registrations` with the
  read token and chosen streams (comments, notifications); the returned secret goes to secure
  storage. Stream changes `PATCH`; both off `DELETE`.
- **Token rotation:** the `registration` event fires again; `handleDeviceTokenRotated()` PATCHes
  every registered account.
- **Backstop** on launch and every resume (`runLaunchBackstopCheck()`): lost OS permission clears
  the service token; a registration reporting `read-token-invalid` runs
  `handleForcedLogout(id, 'service')`.
- Blipfoto's own `push_*` notification settings are not available to our app type; the app never
  reads or writes them. Settings → Notifications edits the `feed_*` settings and b-push's streams.

**Pushes are contentless.** Every endpoint returning notification/comment content marks it read,
so b-push polls counts only. `PushPayload` is
`{ kind: 'activity', stream: 'comments' | 'notifications', accountId }` or `{ kind: 'reauth-required', accountId }`, sent as ordinary FCM
notification messages (data-only ones are deferred in Doze and dropped when force-stopped), so
there is no custom `FirebaseMessagingService`.

**Tap routing** (`pushFlow.routeForPushTap`, awaits `authReady` since a cold-start tap arrives
before accounts load): `reauth-required` → forced logout of the service token,
`/accounts?reauth=<id>`; `activity` → switch to that account, then `/comments` or
`/notifications`; unknown account or needing re-auth → `/accounts`. A received push refreshes the
badge counts. **Hidden-member suppression on push is impossible** (no actor); nothing leaks, and
the inboxes filter what they fetch. The hidden list never leaves the device.

### The two inboxes (`data/notifications.ts`)

- **`SCR-24` comments are structured** (commenter `username`, `unread`, type, entry id), so
  filtering and routing are exact. **Trap:** the first fetch clears all unread comments, so
  `unread` is snapshotted from the first response (`unreadCommentIds()`).
- **`SCR-23` notifications are rendered text**: id, BBCode content, image URL, link URL, has-more
  flag; no actor, type, unread flag or timestamp.
  - **Hidden suppression is best-effort**: `candidateActorsFromNotification()` treats the
    content's `blipfoto.com/<single-segment>` links (excluding `entry`, `me`, `store`, `_assets`)
    as candidate usernames. It degrades silently if Blipfoto changes wording or links.
  - **Routing** (`resolveNotificationTarget`): `/entry/{id}` → entry, `/{username}` → profile. A
    follow request links to the requester's profile, so the path `me/followers/requests` in the
    content is detected instead → `SCR-20`. Anything else opens in the system browser.
- No timestamps in either stream (order by descending id); Blipfoto's bulk/promotional messages
  arrive undistinguished; both keep about 14 days. Hiding is keyed by username (no user id is
  exposed), so a renamed member escapes until re-hidden.
- **Don't call `PUT messages/notifications/unread`**: fetching already marks rows read.
- Badges (`notificationCountsStore`) refresh on launch, account switch and push arrival, and clear
  optimistically when an inbox opens.

## 12. Local notifications and background scheduling

`platform/localNotifications.ts` + `flows/reminderFlow.ts`: `FLW-18`'s daily reminder.

- **One per account** (stable id from the account), channel `reminders`, scheduled
  `{ at: <next occurrence>, every: 'day' }`, not `on: { hour, minute }`: a repeating `on` pattern
  can't skip just today.
- **Suppression by cancellation:** a successful upload calls `rescheduleReminderSkippingToday()`,
  re-anchoring at tomorrow. Nothing runs at fire time.
- **Inexact only**: never `allowWhileIdle` or exact-alarm permissions (Play reserves those for
  alarm-clock-type apps; a few minutes' drift is fine).
- **`POST_NOTIFICATIONS` is shared with push**; a refusal turns the reminder off, no third state.
- Tapping a reminder switches to that account and opens compose. All exports no-op off native.

**Nothing else runs in the background**: no sync, work manager or background fetch.

## 13. Maps and location

`SCR-04` (entries by viewport) and `SCR-12` (place a marker) use **MapLibre GL JS in the WebView**,
not a native plugin: no billing account, works in `vite dev`, one implementation, DOM overlays work.

- **Tiles:** `platform/mapTiles.ts#getMapStyleUrl()`, MapTiler `streets-v2` with
  `VITE_MAP_TILES_KEY`; no key → `null` → the "map unavailable" state.
- **Worker:** `MapScreen` imports `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url` and calls
  `setWorkerUrl()`. Without it the production build never emits the worker and tiles silently fail.
- **Fetching:** bounds debounced 450 ms, request-id supersession, one `entries/search` page per
  bounds change, no clustering; hidden members' entries get no marker.
- **Location** (`platform/geolocation.ts`, coarse) for my-location on `SCR-04`/`SCR-12` and
  Browse's Nearby tab, requested at point of use. Both map screens are lazy routes.

## 14. BBCode

Rendering and the rich editor are in **b-view**; b-mobile injects host behaviour via props.

- **`BBCodeText`** renders via `@bbob/react` to React elements: **no `dangerouslySetInnerHTML`**
  anywhere, since content comes from other members.
- **Tags** (`b-view/src/bbcode.ts`, parser `onlyAllowTags`): `[b]`, `[i]`, `[u]`, `[s]`, `[url]`
  (`[url=…]label[/url]` or bare) and `[email]` (no toolbar button). Unknown tags stay literal text.
  `[url]`: no scheme → `http://`; email-like → `mailto:`; bare uses the target as label.
- **Links open in the system browser** (`onLinkClick={(href) => openUrl(href)}`); the WebView never
  navigates away. blipfoto.com links return to the app only via the opt-in alias (§16).
- **Link creation is gated per account by Blipfoto** (anti-spam threshold; links ignored on
  save) and the API exposes no flag, so the link button is always shown and the app does nothing.
- **Editing:** entry description (`ComposeForm`'s `DescriptionField`) and comments
  (`CommentComposer`) use b-view's ProseMirror **`BBCodeEditor`**, BBCode in and out. The biography
  (`SCR-11`) is a `<textarea>` with `components/BBCodeToolbar.tsx` editing the raw string.

## 15. Camera, photo picking and cropping

- **`platform/camera.ts`** uses the plugin's current `takePhoto()`/`chooseFromGallery()` (not the
  deprecated `getPhoto`/`pickImages`), returning a file path, never base64 (exhausts WebView
  memory). Camera permission only when _Take a photo_ is tapped; a refusal
  (`CameraPermissionDeniedError`) leaves the picker usable, which needs no permission.
- **Cropping:** `react-easy-crop` in `components/PhotoCropper.tsx` (square), not `allowEditing`,
  which depends on an OEM crop activity some devices lack.
- **The two crops differ** (`data/imageCrop.ts`). Entry thumbnail (`SCR-10`): `cropToProportions`
  sends `thumbnail_crop` as `x,y,w` in 0.0–1.0 alongside the **untouched** photo. Avatar
  (`SCR-25`): `avatar` takes an image and has no crop parameter, so `cropToJpegBlob` re-encodes
  the crop and uploads it as a `Blob` `FileSource`.
- **No downscaling** exists. `devicePrefsStore.uploadFullSize` is stored but unread and has no
  Settings control (b-oss#334). Any future resize must not alter the proportional `thumbnail_crop`.
- **Validation** (`data/photoValidation.ts#validatePickedPhoto(photo, purpose)`) at pick time, with
  limits observed from Blipfoto's API: entry ≥ 600 px on **one** edge, no maximum dimension,
  1 KB–20 MB; avatar ≥ 300 px on one edge, with Blipfoto's 3 MB cap met by the cropped JPEG, so the
  picked file is only bounded at 40 MB.

## 16. Deep links, the OAuth redirect, and share intents

- **OAuth redirect** `bmobile://oauth/…`: consumed by `oauthRound`'s own listener (§8).
- **Content links** `bmobile://entry/:id`, `bmobile://user/:username`: `flows/deepLinkResolver.ts`
  → `/entry/…`, `/user/…` (not gated).
- **Blipfoto web links** `https://www.blipfoto.com/…` (opt-in, below): resolver →
  `resolveWebPathTarget` (entry, profile, follow requests).
- **Share an image** (`ACTION_SEND` `image/*`): `ShareIntentPlugin` + `platform/shareIntent.ts` →
  `/compose` with the photo, through the write gate.
- **Push / reminder taps**: `pushFlow.routeForPushTap` (§11), `onReminderTapped` (§12).

`resolveDeepLink()` serves cold start (`getLaunchUrl()`) and warm start (`onAppUrlOpen`) alike;
navigation is injected (`routeDeepLink(target, push)`). `appUrlOpen` never carries `ACTION_SEND`
extras, hence the share plugin, which copies the stream into the cache dir and strips
`EXTRA_STREAM` so a resume doesn't re-import it.

**`bmobile://`** serves redirect and content, distinguished by host. Not `blipfoto://` (custom
schemes have no ownership check, and this is an unofficial app); unhyphenated to dodge strict
validators. **The redirect needs its trailing slash**: Blipfoto's registration rejects
`bmobile://oauth`, and matching is exact-string, so every use is `bmobile://oauth/`.

**Opt-in web links:** the `https://www.blipfoto.com` filter is on `<activity-alias
.BlipfotoWebLinkAlias>`, **disabled by default** and **not** `autoVerify` (App Links would need
`assetlinks.json` on blipfoto.com). `BlipfotoLinksPlugin` toggles it with
`PackageManager.setComponentEnabledSetting()` from `devicePrefsStore.openBlipfotoLinksInApp`, adding
the app to the chooser rather than hijacking links.

## 17. Android project configuration

`android/` is checked in; `google-services.json` is gitignored (§11). SDK levels
(`variables.gradle`): **minSdk 24, compileSdk 36, targetSdk 36**, Capacitor 8's defaults; re-check on
a Capacitor major upgrade.

**Permissions**, each requested at point of use: `INTERNET`; `POST_NOTIFICATIONS` (push, reminders);
`CAMERA` (_Take a photo_ only); `ACCESS_COARSE_LOCATION`/`ACCESS_FINE_LOCATION` (Nearby,
my-location). No storage permissions (the picker grants per item; `MediaSavePlugin` uses MediaStore
on Android 10+, the app's own Pictures folder below). No exact-alarm permissions (§12).

**Manifest and native code:**

- `android:allowBackup="false"`; `MainActivity` is `singleTask` with `bmobile://` VIEW and
  `ACTION_SEND image/*` filters; the disabled `BlipfotoWebLinkAlias` (§16); a `FileProvider`.
- **Channels** created by `MainActivity` at every launch: `activity`, `system_alerts`, `reminders`,
  `uploads` (unused). b-push sets the channel on each message; FCM's default is `activity`.
- **Local plugins** registered in `MainActivity`, each with a `src/platform/` wrapper:
  `BlipfotoLinksPlugin`, `AccessibilityPlugin`, `ShareIntentPlugin`, `EmbeddedAuthPlugin` (+
  non-exported `EmbeddedAuthActivity`), `PushAvailabilityPlugin`, `MediaSavePlugin`.
- **Application ID** `io.github.ianmstevenson.bmobile`; revisit before a first Play submission,
  after which it is permanent. Release is manual; signing keys live outside the repo.

## 18. Configuration and secrets

Vite env vars from the **repo root** (`envDir`): committed `.env.example`, gitignored `.env.local`;
typed in `src/env.d.ts`.

Not secret: `VITE_BLIPFOTO_CLIENT_ID` (also the anonymous bearer), `VITE_OAUTH_REDIRECT_URI`
(`bmobile://oauth/`, the default if unset), `VITE_NOTIFY_SERVICE_URL` (b-push base URL),
`VITE_FEED_PROBE` (`1` builds the feed-depth probe, b-oss#196; unset for releases). Never commit a
real value: `VITE_NOTIFY_REGISTRATION_SECRET`, `VITE_MAP_TILES_KEY`, `VITE_DEV_TOKEN` (dev only,
auto-applied at launch in development mode, §19).

Anything in the bundle is extractable: the registration secret is a coarse gate, not a credential,
and the tile key must be one a provider tolerates being public.

## 19. Testing

Vitest + Testing Library under jsdom, run from the repo root. Pure logic (error mapping, write gate,
queue, BBCode preset, deep links, notification suppression/routing, crop maths) carries most of the
tests; screens render with `src/platform/` mocked and `b-api` stubbed, using
`app/routes/test-router.tsx`. On-device checks are manual; there is no device or emulator on the dev
VM, and unverified paths are listed in [`../UNTESTED_PATHS.md`](../UNTESTED_PATHS.md).

`vite.config.ts`'s `test` block aliases `@lit/react` to its browser build and inlines it; otherwise
Vitest resolves Ionic 9's wrappers to an SSR build and components render as inert tags.

**Browser-mode development.** `vite dev` proxies `/api/blipfoto` to `https://api.blipfoto.com` (or
`B_API_PROXY_TARGET`, e.g. `scripts/stub-api.mjs`); dev only. A desktop browser can't capture the
OAuth redirect, so in development mode `AppShell` verifies and applies `VITE_DEV_TOKEN` via
`accountsFlow.devSignInWithToken()`, the same account-creation path a real round uses.

## 20. Accessibility, responsiveness and performance

- **Font scaling.** The WebView ignores Android's font scale and `devicePixelRatio` isn't it.
  `platform/accessibility.ts#applyFontScale()` reads it via `AccessibilityPlugin` at launch and sets
  the root font size; layouts use `rem`, so 200% reflows. No-op off native.
- **Targets and labels.** Ionic components carry roles and focus handling; app-specific controls
  need their own (48 px rows/targets in `globals.css`).
- **Responsiveness.** One navigation model at every size; grids size columns from available width;
  nothing is portrait-locked, and state in stores and route params survives rotation.
- **Performance.** Thumbnails in grids, full size only on entry/photo screens; `CachedImage`
  lazy-loads; MapLibre (the largest dependency) and react-easy-crop sit behind lazy routes; no list
  virtualisation (grids are image-bound).

## Gotchas

Things that are not obvious from the code and have caused real time loss.

**Build and tooling**

- Cross-package `.tsx` source imports: do not add a package-local `declare module '*.module.css'`
  to b-mobile unless it has its own CSS Modules. The root `types/globals.d.ts` already covers it.
- Single-workspace test runs from inside a package directory (`cd packages/b-push && npx vitest
run`) break the root `vitest.config.ts` `setupFiles` path, which resolves against the shell's
  cwd. Run tests from the repo root (`npm test` or `npx vitest run <path>`).
- A JSDoc block comment containing a literal `*/` closes early. Describe such patterns in words.
- `@capacitor/assets` defaults the adaptive-icon/splash background to white. Pass
  `--iconBackgroundColor`/`--splashBackgroundColor` and check the rendered output.
- A large dependency pulled in by one screen needs a lazy-loading check against `npm run build`'s
  chunk output (`maplibre-gl` and `@ionic/react` are the known >500 KB chunks).
- The manifest permission list in `android/` is deliberately redundant with what plugin manifests
  merge in, so the §17 table stays satisfied if a plugin changes.
- No Android device or emulator is available on the dev VM. Compilation (`./gradlew
assembleDebug`), jsdom tests and a headless-browser pass (Playwright, see the `run-b-view`
  skill) do not verify on-device behaviour. Do not claim device behaviour is verified from them;
  see `docs/UNTESTED_PATHS.md`.

**Testing under jsdom**

- `ion-segment` calls `Element.scrollTo`, which jsdom lacks. `src/test-setup.ts` shims it and is
  wired into both `vite.config.ts` and the root `vitest.config.ts`.
- `IonLabel` does not reliably render its children in the jsdom setup; use plain
  `<span>`/`<strong>` inside `IonItem`. `IonButton`'s `aria-label` does not reach the DOM; query
  with `screen.getByText('label', { selector: 'ion-button' })`.
- `IonAlert` renders its buttons unconditionally, regardless of `isOpen`. Scope queries with
  `{ selector: 'ion-button' }`, or through the alert's `header` attribute when a screen has
  several.
- `IonModal`/`IonPopover` `present()` throws "framework delegate is missing" under jsdom. Use a
  styled `<div role="dialog">` for sheet/panel overlays that need tests (see `OverlayProvider`).
- Give `vi.fn<...>()` an explicit function-type generic; `ReturnType<typeof vi.fn()>` infers
  `any` and trips `no-unsafe-return`. For single-object-argument mocks, type the mock and the
  `vi.mock()` factory to take that one argument.
- A `Response` body can be read once; build a fresh `new Response(...)` per mocked `fetch` call.
- A bare `vi.fn()` keeps its call history across `vi.restoreAllMocks()`; call `.mockReset()` or
  `.mockClear()` explicitly.
- Give every mocked async method in a call chain an explicit `mockResolvedValue`/
  `mockRejectedValue`. An unconfigured `vi.fn()` returns `undefined`, and `.then()` on that throws
  a TypeError that an enclosing `try/catch` silently swallows, which looks like a wrong-branch bug.
- Use `await userEvent.click(...)` rather than `element.click()` when the handler chains several
  `await`s before its first `setState`.

**State and data**

- Zustand selectors must not return newly allocated values (breaks `useSyncExternalStore`
  reference equality). An effect that depends on a value its own success path clears can
  re-trigger; seed a `useRef` once at mount instead.
- Anything reading `accountsStore` on mount must await `state/authReady.ts`. Hydration (and the
  dev `VITE_DEV_TOKEN` seed) is async, and an unset `activeAccountId` looks identical to signed
  out. `getClient()` already awaits it; code that reads the store directly must too.
- Existing `b-api` methods and types are not necessarily complete just because a name matches.
  Check what a method actually returns and sends before building on it (the notification-settings
  update takes flat, un-namespaced keys; `BlipComment.unread` exists only on the comments-inbox
  response). Defensive code with no caller yet usually points at a gap still to come.
- `user/awards.json` returns the full award catalogue, not only earned awards; unearned ones have
  `added_stamp: null`. Award names come from a slug table in `AwardsScreen.tsx`; no endpoint
  returns them. `awardLabel()` shows "Secret" from each award's `secret` flag.
- `SCR-06`/`07`/`08` refetch via `useLiveEntry` and `SCR-16` takes its context from router state,
  rather than depending on a prior screen's in-memory data, for deep-link resilience. Compose and
  edit (`SCR-10`–`13`) deliberately share `composeDraftStore`.
- `devicePrefsStore.uploadFullSize` has no consumer (no client-side downscaling exists) and no
  Settings control. Tracked in b-oss#334.

**Native (Android)**

- `CapacitorHttp` on Android ignores `responseType: 'text'` when the response `Content-Type` is
  `application/json` and returns an already-parsed object. `platformFetch` re-stringifies when
  the result is not a string; do not assume `responseType` is honoured on native.
- `platformFetch` must build a `Response` with a `null` body for 101/103/204/205/304: the
  constructor throws on any body for those, and b-push answers PATCH/DELETE with 204 (b-oss#148).
- `@capacitor/app`'s `appUrlOpen`/`getLaunchUrl()` only see VIEW-action launch URLs, never an
  `ACTION_SEND` share intent's binary extras. Share-target work needs native code reading
  `Activity.getIntent()`; `ShareIntentPlugin.java` is the precedent.
- `PushNotifications.register()` on a build without `google-services.json` kills the process
  natively; always gate on `isPushAvailable()`.
- `IonHeader`/`IonToolbar` add safe-area padding automatically; nothing else does. Areas with no
  header above (e.g. `IonMenu` content) or no footer below scrollable content need explicit
  safe-area padding. Check live device insets rather than reusing fixed numbers.
- The multipart upload path in `platform/upload.ts` (§7) has not been exercised on a real device
  against the live API; see b-oss#336.

**Process**

- Several agent sessions can share a worktree. If a file you did not touch shows as modified,
  check for other `claude`/`hapi` processes and `git diff` it before reverting or committing it.
