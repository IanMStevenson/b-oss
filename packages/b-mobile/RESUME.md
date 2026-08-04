# b-mobile — resume point

Rewritten at the end of every phase / major milestone. Read this first, then the last 20 entries
of `AGENT_LOG.md`, then `PLAN.md`, before doing anything else — especially if this session started
with "resume".

## Status

**Phases 0–9 are all complete and pushed to `b-mobile-initial`.** Phase 0 (prerequisite `b-oss`
refactor) is merged into `main`. The app now has: a working Vite/Ionic/Capacitor skeleton, the full
28-screen route table, a real OAuth round and full account-management flow, real `SCR-01`/`SCR-30`,
a functional write-gate, real Browse/Tag-Entries/Entry-Detail/Full-screen-Photo/Entry-Metadata
screens, a full social action bar on `SCR-06`, inline comment reply/edit/delete/report, real
`SCR-15`/`SCR-16`/`SCR-31`, a working hidden-members system, real profile screens (`SCR-17`/
`SCR-18`), followers/following/pending-requests/refused-followers/awards (`SCR-19`–`SCR-22`), real
`SCR-03` Search and `SCR-04` Map, a full compose/publish/edit pipeline (`SCR-09`–`SCR-14`, a
durable background upload queue, camera/crop/multipart-upload), `FLW-13`'s owner-only Edit/
Replace-photo/Delete, `FLW-18`'s daily reminder, real `SCR-25` Settings and `SCR-29` Help & Info —
and, as of Phase 9, **a fully live notification pipeline**: a new peer package `packages/b-push`
(Cloudflare Worker + D1 — counts-only 1-minute activity poll, hourly preference refresh, the full
registration contract, FCM HTTP v1 push, `reauth-required` handling; never deployed by this
session, per its own explicit scope boundary, but fully built, typechecked, linted and tested
against a real in-memory SQLite database), real `SCR-23`/`SCR-24` inboxes (asymmetric hidden-member
suppression, the first-page-unread-snapshot pattern), `flows/pushFlow.ts` driving the full
registration lifecycle (permission-before-auth, launch backstop, FCM-token-rotation handling),
every `TODO(Phase 9)` marker in `flows/accountsFlow.ts` replaced with real calls, and `SCR-25`'s
Advanced polling-interval control PATCHing a live registration. Full monorepo
`typecheck && lint && test && build` green (653 tests, confirmed stable across repeated runs).
**Phase 10 (Android project & platform polish) has not started.**

## Last completed step

Committed and pushed `feat(b-mobile): Phase 9 — Notifications: b-push + client (SCR-23/24,
FLW-15/16)` and `docs(b-mobile): log Phase 9 completion, point RESUME at Phase 10`. This is Phase
9's full scope per `PLAN.md`'s checklist. Worth reading in full before touching the same modules
again — the complete reasoning is in `AGENT_LOG.md`'s Phase 9 entry, this is the short version:

1. **`b-push` reuses `@b-oss/b-api`'s `BlipfotoClient`**, not a second hand-rolled HTTP client —
   `b-api` has no Node/Electron/browser-specific dependency, so it's exactly as safe to import
   from a Cloudflare Worker as from `b-mobile`.
2. **D1 access is typed against a small hand-rolled `DbLike` interface**
   (`packages/b-push/src/db.ts`), not the full `@cloudflare/workers-types` `D1Database` — a real
   `D1Database` satisfies it structurally with no cast (strictly more methods), and tests pass a
   `node:sqlite`-backed fake satisfying the same minimal shape, exercising the real
   `src/schema.sql` rather than a second re-implementation of it. No `wrangler`/`miniflare`
   dependency was added to the repo at all.
3. **Two real bugs found designing `b-push`, both documented prominently in the code itself, not
   just here**: `createRegistration` now seeds `last_seen_*_total`/`cached_push_prefs` from a real
   round-trip at registration time (else the first activity-poll tick would false-positive on
   pre-existing unread items); `prefsRefresh.ts`'s hourly tick must never itself mark a
   registration `read-token-invalid` (only the 1-minute activity poll may — otherwise the dead row
   gets silently excluded from the query that's actually supposed to detect it and send the
   `reauth-required` push).
4. **A third real bug, found wiring the app side**: `changeAccountMode`'s read-only
   notification-enabling branch used to run unconditionally whenever `target.notifications` was
   true, even when already on — meaning a repeat call would `POST` a _new_ registration every
   time (there's no idempotent "refresh" verb), orphaning the previous row. Fixed by gating on
   `!refreshed.hasServiceToken`, matching every other transition in that function.
5. **`accountsFlow.ts` and `pushFlow.ts` import from each other** (a genuine circular ES-module
   dependency) — safe here because every cross-reference is used only inside a function body,
   never at module-evaluation time. Confirmed via the full build/test suite, not just reasoning
   about it.
6. **`root package.json`'s `typecheck` script needed a one-line addition** (`&&
tsc -p packages/b-push --noEmit`) — `build`/`test` picked the new workspace up automatically,
   but `typecheck` explicitly lists every package by name, so app-architecture.md §2's "inherits
   root tooling unchanged" claim doesn't quite hold without that edit. Checked, not assumed.
7. **A real, pre-existing gap found and documented, deliberately not fixed**: `platform/http.ts`'s
   native `CapacitorHttp` transport is still exactly the Phase 1 stub — every native GET request
   the app makes, not just this phase's, would throw on a real device. No phase since Phase 1
   closed it despite Phases 3–8 building real device-facing data screens on top of it. Out of
   Phase 9's scope (unrelated to notifications, and too risky a foundational file to touch as a
   side effect) — flagged here so it isn't rediscovered from scratch; whichever phase does real
   on-device testing needs to close it first.
8. **A small `b-api` gap found and fixed along the way**: `BlipComment` had no `unread` field
   despite data-model.md/app-architecture.md §11 both describing the comments-inbox response as
   carrying one. Added as `unread?: 0 | 1` (only ever populated by `messages/comments/recent`).

## Next intended step

Start **Phase 10 — Android project & platform polish** on `b-mobile-initial` (no PR), per
`PLAN.md`'s phase list:

1. **Check in the `android/` project.** Currently only the `@capacitor/android` npm package
   exists under `node_modules` — no native project directory has ever been generated (`npx cap
add android` or equivalent). app-architecture.md §17 requires it be checked into the repo, not
   generated at build time, since it holds hand-edited manifest/backup-rules/activity-alias/
   `google-services.json` content the build shouldn't regenerate over.
2. **Manifest and permissions** (§17's table): `INTERNET`, `POST_NOTIFICATIONS`, `CAMERA`,
   `ACCESS_COARSE_LOCATION`/`ACCESS_FINE_LOCATION` — nothing else, explicitly _no_ storage
   permissions (the system photo picker grants per-item access) and _no_
   `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM` (§12's reminder-timing decision already made in Phase
   7 depends on this never being requested). `android:allowBackup="false"` (§8).
3. **The `bmobile://` intent filter** for the OAuth redirect and content links, plus the
   **disabled** `<activity-alias>` carrying the non-`autoVerify` `https://www.blipfoto.com` filter
   — this is what finally gives `devicePrefsStore.openBlipfotoLinksInApp` (Phase 8's toggle, which
   has persisted with zero native effect since it was built) something real to act on via
   `PackageManager.setComponentEnabledSetting()` from a small custom plugin (§16).
4. **Notification channels per category** (activity, system alerts, reminders, uploads) — §17:
   "so users can tune them in system settings." No custom `FirebaseMessagingService` (§11's
   deliberate choice, already built — pushes stay ordinary FCM notification messages).
5. **Adaptive launcher icon and splash screen** from `assets/`, via the existing
   `scripts/copy-icons.mjs` conventions where they apply. SDK levels: minSdk 24, compile/target
   SDK 36 (§17 — Capacitor 8's floor/default). Application id
   `io.github.ianmstevenson.bmobile` (§17 — adequate for dev/review, revisit before Play
   submission).
6. **Accessibility font-scale pass** (§20) — smoke-tested as early as Phase 3 per the plan, not
   deferred wholesale to this phase; this is where it gets a real, dedicated pass against an
   actual Android font-scale setting (the WebView doesn't apply it automatically — needs reading
   the OS setting explicitly and setting a root font-size multiplier).
7. **Worth picking up early, now that there's a real Android project to test against**: closing
   Phase 9's own documented gap in `platform/http.ts`'s native `CapacitorHttp` transport — real
   on-device testing can't get past the OAuth round without it, and this is the first phase where
   "real on-device testing" becomes possible at all (there's been no `android/` project to build
   and install until now).
8. **Verify**: full monorepo `typecheck && lint && test && build`, plus §19's layer-3 manual
   on-device checklist for anything this phase makes testable for the first time (OAuth redirect,
   multipart upload, push delivery, exact-alarm-free reminder timing) — the first point in the
   whole project at which that checklist can actually be run, since it needs a real installed APK.

## Open decisions / blockers

None on the spec side. Still needed from the user eventually, not blocking Phase 10's start: real
`VITE_BLIPFOTO_CLIENT_ID`/`VITE_MAP_TILES_KEY`/`VITE_NOTIFY_SERVICE_URL`/
`VITE_NOTIFY_REGISTRATION_SECRET` values in a local `.env`, an actual Cloudflare account to deploy
`b-push` to (Workers + D1 + a Firebase project for FCM's service-account JSON), and eventually
Android signing keys for release (§17 — kept outside the repo). None of the OAuth round, `b-push`'s
registration contract, or any live data/action/write screen built so far has been tested against
the real services for the same reason — expected, matches the spec's own stance that this isn't a
pre-build gate. `platform/http.ts`'s native transport gap (see above) means on-device testing can't
proceed at all until that's closed, which is now flagged as Phase 10 work rather than a surprise.

## Gotchas discovered so far (not obvious from the code)

- **`b-visual`** is the current, correct name for the shared design-tokens/style-guide package.
- **Cross-package `.tsx` source imports need care with ambient CSS declarations.** Don't add a
  package-local `declare module '*.module.css'` to `b-mobile` unless it truly has its own CSS
  Modules — the root `types/globals.d.ts` already covers everything. Full writeup: Phase 0.2's
  `AGENT_LOG.md` entry (2026-08-03).
- **`b-api`'s existing methods/types aren't fully trustworthy against the spec just because
  something with the right name exists** — check what it actually returns/does before building on
  it. Found repeatedly across almost every phase: the multipart seam (Phase 0.3), `verifyToken()`
  not returning `scope` (Phase 2), `getEntry`'s `returnFriendships` option (Phase 4),
  `@capacitor/camera`'s current API sidestepping a hand-rolled EXIF parser (Phase 7, a shortcut
  rather than a gap), `updateNotificationSettings`'s flat un-namespaced key shape only discoverable
  from `b-api`'s own test fixtures (Phase 8), and now `BlipComment` missing an `unread` field
  entirely (Phase 9) despite data-model.md/app-architecture.md both describing one. Keep checking
  — don't assume every phase finds a gap, but don't assume a name match is enough either.
- **No headless browser available in this sandbox** — `playwright install --with-deps` needs
  root. Verification uses jsdom-rendered Testing Library smoke tests instead. Don't re-attempt
  `playwright install --with-deps` expecting a different result. The same gap applies to anything
  else that needs a real renderer (`maplibre-gl`, Phase 6; `react-easy-crop`, Phase 7) — mock at
  the boundary, test the component's own logic, is the template. **Phase 9 extended the same
  principle to a non-rendering boundary**: `b-push`'s tests mock FCM/Blipfoto at the `fetch`
  boundary and use a real `node:sqlite`-backed fake (not miniflare/wrangler) for D1, rather than
  standing up a real Cloudflare Workers test runtime.
- **`ReturnType<typeof vi.fn()>` used as a mock's declared type infers `any`, and returning `any`
  from an arrow function trips `@typescript-eslint/no-unsafe-return`** (Phase 9, found writing
  `pushFlow.test.ts`/`accountsFlow.test.ts`'s new mocks) — always give `vi.fn<...>()` an explicit
  function-type generic (e.g. `vi.fn<(...args: unknown[]) => Promise<boolean>>()`) when the mock
  is later called through a wrapping arrow function inside a `vi.mock()` factory, not just
  `vi.fn()` bare. The existing `accountsFlow.test.ts` mocks (predating this) happened to avoid the
  issue by using inline typed closures instead of a bare `vi.fn()` reference.
- **A `Response` body can only be read once — reusing the same mocked `Response` instance across
  multiple/concurrent `fetch()` calls throws "Body is unusable"** (Phase 9, found in `b-push`'s
  own tests: `createRegistration`'s `Promise.all([fetchUnreadTotals, fetchPushConfigured])` makes
  two concurrent calls, and a sequential multi-registration sweep like `prefsRefresh` hits the
  same trap even without concurrency). Use `vi.fn().mockImplementation(() => Promise.resolve(new
Response(...)))` (a fresh instance per call) whenever a mocked fetch is exercised more than
  once in one test, never a single `mockResolvedValue(sharedResponseInstance)`.
- **A JSDoc block comment containing a literal `*/` substring (e.g. writing out a cron pattern
  like `*/1 * * * *` in a comment) closes the comment early**, silently turning the rest of the
  intended comment into real code and producing a cascade of unrelated-looking parse errors
  several lines later (Phase 9, `b-push/src/index.ts`). Describe such patterns in words instead
  ("every 1 minute") rather than embedding the literal cron string inside a `/** */` block.
- **jsdom has no `Element.scrollTo`**, which `ion-segment` (and likely other Ionic components)
  call when their active item changes — throws otherwise. Fixed with a guarded shim,
  `packages/b-mobile/src/test-setup.ts`, wired into **both** `packages/b-mobile/vite.config.ts`'s
  own `test.setupFiles` _and_ the root `vitest.config.ts`'s (root `npm test` doesn't pick up
  per-package Vite configs at all).
- **Two Zustand-selector footguns, same root cause — worth remembering as a category**: a selector
  that returns a _newly allocated_ value (empty array/object literal, or a fresh wrapper object)
  on every call, even when nothing changed, breaks `useSyncExternalStore`'s reference-equality
  snapshot check. Manifests either as an infinite render loop (`useHiddenMembers`'s old `?? []`
  fallback) or as silently-reverted state (`useLiveEntry`'s `entryState` wrapper being
  reconstructed every render, clobbering an optimistic update via a `useEffect` that depended on
  it). **A close relative, found in Phase 7**: an effect that depends on a value which its own
  success path _clears_ can re-trigger itself right after succeeding (`EditEntryScreen`'s
  `isCurrentDraft`) — fixed with a `useRef` seeded once at mount rather than a reactive
  dependency. Before adding a new derived-value selector or an effect depending on a hook's return
  object _or_ a value one of the effect's own handlers can mutate, check whether it's stable.
- **A raw `element.click()` in a test doesn't reliably synchronize with a handler that chains
  multiple `await`s before its first `setState`**, under the CPU contention the full monorepo
  `npm test` run creates in this sandbox. `@testing-library/user-event`'s `await
userEvent.click(...)` does. Default to `userEvent` over a bare `.click()`/`.dispatchEvent()` for
  any test exercising a multi-await async handler.
- **`IonAlert` renders its buttons into the DOM unconditionally, regardless of `isOpen`** — scope
  trigger queries with `{ selector: 'ion-button' }`; for the alert's own destructive button on a
  screen with only one such alert, `document.querySelector('button.alert-button-role-destructive')`
  works. **Once a screen has _multiple distinct_ destructive `IonAlert`s** (`SCR-06` has four),
  scope through the alert's own `header` attribute instead:
  `document.querySelector('ion-alert[header="…"] button.alert-button-role-destructive')`.
- **`IonLabel` didn't render its children reliably in this jsdom test setup** on several
  screens (Phase 4, Phase 8's `HelpInfoScreen`/`SettingsScreen`) — root cause not fully diagnosed.
  Fixed by using plain `<span>`/`<strong>` children inside `IonItem` instead (not a "never use
  IonLabel" rule — existing screens using it successfully were left alone), the same choice
  `UserRow.tsx`/`BBCodeToolbar.tsx`/**`SCR-23`/`SCR-24`'s new rows (Phase 9)** all made.
  `IonButton`'s `aria-label` prop also didn't reach the rendered `<ion-button>`'s DOM attributes
  (Phase 6) — `screen.getByText('label', { selector: 'ion-button' })` works reliably instead.
- **`b-view`'s `EntryDetail` and `ThumbnailGrid` are not reused by `b-mobile`, on purpose** —
  `EntryDetail`'s `dangerouslySetInnerHTML` conflicts with §14's ban; `ThumbnailGrid`'s windowed
  pagination doesn't fit any feed here. `EntryGrid`/`BBCodeText` were built instead. **`SCR-23`'s
  notification rows (Phase 9) extend the same discipline one step further**: `content_html` is
  parsed only as _text_ (a regex scan for `href` values, for hidden-member suppression/routing),
  never rendered — the row displays the separate raw `content` field in a plain `<span>` instead,
  since it's already server-composed prose, not BBCode, with nothing to parse for display.
- **`SCR-07`/`SCR-08`/`SCR-15`/`SCR-16` all deliberately avoid depending on a prior screen's
  in-memory data**, refetching via `useLiveEntry`/router state instead, for deep-link resilience.
  **`SCR-10`–`SCR-13` (Phase 7) are the deliberate exception**: they share one in-memory
  `composeDraftStore` (app-architecture.md §6 "Draft state") precisely _because_ `SCR-11`/`SCR-12`
  need to write results back into an in-progress, not-yet-submitted draft with no deep-link case
  at all. Don't "fix" this by threading the draft through router state instead. **`SCR-23`/
  `SCR-24` (Phase 9) fit the _first_ pattern, not this exception** — both refetch fresh on every
  visit (`rules.md`'s caching rule, restated explicitly by both screens' own specs), and neither
  has any shared in-memory state with anything else.
- **`changeAccountMode`'s one known deviation from auth.md's exact transition table**: documented
  in `flows/accountsFlow.ts`'s own docstring. Not a correctness bug.
- **Blipfoto's exact registration/terms/help page URLs still aren't stated anywhere in the
  spec** — `SCR-01`'s "Create account" link and `SCR-29`'s Help/Terms/Privacy policy/
  Delete-account links all point at the bare `https://www.blipfoto.com` root with a TODO. Still
  open; a real navigation-team pass fills these in eventually.
- **A large third-party dependency pulled in by a single screen needs an explicit lazy-loading
  check, not just a green typecheck/lint/test** — inspect `npm run build`'s own chunk-size output
  whenever a new screen/dependency lands. **But not every large chunk in the build output is a
  regression** — the two >500KB chunks flagged since Phase 6/7 (`maplibre-gl`, `@ionic/react`
  itself) are still the same ones as of Phase 9, reconfirmed by the same grep-for-a-telltale-symbol
  method each time a phase adds a new dependency (Phase 9: `@capacitor/push-notifications`,
  confirmed absent from both flagged chunks, present only in the small eager main chunk alongside
  every other core, non-lazy-loaded Capacitor plugin).
- **`platform/http.ts`'s native `CapacitorHttp` transport has never been implemented at all** —
  see "Last completed step" point 7, above. This is the load-bearing gotcha to know before
  starting Phase 10's on-device testing: nothing beyond the OAuth round will work on a real device
  until this is closed.
- **`SCR-18`'s "Remove follower" is a documented, deliberate gap, not an oversight** —
  `getUserProfile`'s friendship data is viewer-relative and doesn't say whether they follow you.
  `SCR-19`'s Followers list is the correct place for it (already built, already works).
- **`platform/upload.ts`'s native multipart path has never run against a real device or the real
  API** — design is source-verified (app-architecture.md §7 reads the plugin's actual native code),
  and the one subtlety only discoverable by reading the plugin's TS surface directly
  (`FileTransfer.uploadFile()` rejecting on an HTTP error status rather than resolving) is fixed
  and documented (Phase 7). Still worth a real device test as part of the manual §19-layer-3
  checklist, now finally possible starting Phase 10.
- **`devicePrefsStore.uploadFullSize` has no consumer yet** — it persists and defaults to `true`
  (matching current behaviour), but no client-side photo downscaling exists anywhere in this app
  (Phase 7's compose/edit screens only crop, never resize). Whoever builds the downscale step on
  `SCR-10`/`SCR-13`'s upload path is the one who wires this toggle to something real.
- **`devicePrefsStore.openBlipfotoLinksInApp` (Phase 8) has been persisted with zero native effect
  since it was built** — it's the opt-in `<activity-alias>` toggle app-architecture.md §16
  describes, but there's been no `android/` project to hold the actual manifest entry until
  Phase 10 checks one in. See "Next intended step" point 3, above.
