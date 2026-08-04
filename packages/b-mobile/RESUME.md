# b-mobile — resume point

Rewritten at the end of every phase / major milestone. Read this first, then the last 20 entries
of `AGENT_LOG.md`, then `PLAN.md`, before doing anything else — especially if this session started
with "resume".

## Status

**Phases 0–10 are all complete and pushed to `b-mobile-initial`.** Phase 0 (prerequisite `b-oss`
refactor) is merged into `main`. The app now has: a working Vite/Ionic/Capacitor skeleton, the full
28-screen route table, a real OAuth round and full account-management flow, a functional write-gate,
real Browse/Tag-Entries/Entry-Detail/Full-screen-Photo/Entry-Metadata screens, a full social action
bar, inline comment reply/edit/delete/report, a working hidden-members system, real profile/
followers/following/pending-requests/refused-followers/awards screens, real Search and Map, a full
compose/publish/edit pipeline with a durable background upload queue, real Settings and Help & Info,
a fully live notification pipeline (`packages/b-push` — Cloudflare Worker + D1, never deployed by
any session per its own explicit scope boundary, but fully built/tested), and now, as of Phase 10, a
**real, checked-in Android native project** (`packages/b-mobile/android/`): manifest permissions,
the `bmobile://` deep-link + opt-in web-link `<activity-alias>` (backed by a real local plugin, not
just a persisted-but-inert toggle anymore), four native notification channels wired end to end into
both `b-push` and the local-reminder path, a brand-correct adaptive icon and splash screen, a real
accessibility font-scale mechanism (also backed by a local plugin), and — closing a gap open since
Phase 1 — `platform/http.ts`'s native `CapacitorHttp` transport is now actually implemented. Full
monorepo `typecheck && lint && test && build` green (661 tests, confirmed stable across repeated
runs), plus a real `./gradlew assembleDebug` producing an actual APK.
**Phase 11 (Testing hardening) has not started.**

## Last completed step

Committed (not yet pushed — do that first if resuming) Phase 10's full scope per `PLAN.md`'s
checklist. Worth reading `AGENT_LOG.md`'s Phase 10 entry in full before touching the same modules
again — the complete reasoning is there; the short version:

1. **`android/` was generated via a real `npx cap add android`**, with `@capacitor/android` added
   as a genuine dependency (not hand-assembled) — `variables.gradle`/`app/build.gradle` came out of
   that step already matching §17's SDK levels and application id exactly, nothing to correct.
2. **Two new local, single-project Capacitor plugins** (`android/app/.../BlipfotoLinksPlugin.java`,
   `AccessibilityPlugin.java` — Java, registered in `MainActivity.onCreate()`, **not** npm
   packages): the first finally gives `devicePrefsStore.openBlipfotoLinksInApp` (persisted since
   Phase 8 with zero native effect) a real `PackageManager.setComponentEnabledSetting()` effect,
   synced both on toggle and on every launch's `hydrate()` (a fresh install always starts with the
   alias disabled, so a restored `true` preference needs re-syncing, not just future toggles);
   the second exposes `Resources.getConfiguration().fontScale`, read once at launch
   (`AppShell.tsx`'s existing mount effect) to set a root font-size multiplier every `rem`-based
   size in the app scales off.
3. **Notification channels only matter if something routes messages into them.** Creating the four
   channels natively was the easy half — `b-push`'s `fcm.ts` needed a real code change
   (`android.notification.channel_id` set explicitly per payload kind: `system_alerts` for
   `reauth-required`, `activity` for everything else) and `platform/localNotifications.ts`'s
   reminder schedule needed `channelId: 'reminders'` added, or the channels would exist unused
   and every notification would silently fall back to the OS default channel regardless.
4. **`platform/http.ts`'s native transport — open since Phase 1, reconfirmed as a blocker in three
   later phases' own entries — is now implemented.** Three choices worth remembering: forces
   `responseType: 'text'` on every native request (every real caller only ever reads
   `response.text()`, never `.json()`, so there's no reason to let CapacitorHttp auto-parse then
   re-stringify); constructs a **real** `Response` object from the native result rather than a
   duck-typed stand-in, which is what makes `b-api`'s existing (defensively-written)
   `headers instanceof Headers` check in `updateRateLimit()` actually take its true branch instead
   of silently falling back; and uses an explicit, narrow body-type allow-list
   (`undefined | URLSearchParams | string` — matching what the two real call sites ever send)
   that throws on anything else, rather than a blanket `String(body)` that would silently produce
   `"[object Object]"` for a body type this function was never meant to handle.
5. **A real, if small, accessibility violation found and fixed along the way**: two inline
   `style={{fontSize: 12}}` usages (`MonthDatePicker.tsx`, `RefusedFollowersScreen.tsx`) set an
   absolute pixel size the new root multiplier can't reach — fixed to `'0.75rem'`. A repo-wide
   grep for px `font-size` in `.css` files found nothing else to fix.
6. **The adaptive icon/splash generator's default background is plain white**, not this app's
   brand green — checked visually (rendered the generated PNGs, didn't just trust the tool's log
   output) before and after passing `--iconBackgroundColor`/`--splashBackgroundColor '#1f4d3a'`.
   `@capacitor/assets` itself was run via `npx`, **deliberately not added as a project
   dependency** (a first `npm install` attempt pulled in a large, dated tree with a critical
   vulnerability, for what's a one-off asset-generation step) — `scripts/generate-android-assets.sh`
   is the reproducible, documented entry point, mirroring `scripts/make-icns.sh`'s existing
   precedent of a manual, non-build-time asset script.
7. **Verified with a real `./gradlew assembleDebug`** (`~/Android/Sdk` already present on this
   machine) — 400 real Gradle tasks, a real `app-debug.apk` produced. This is the strongest
   evidence available in this sandbox that the manifest XML and both new Java plugins actually
   compile and package together, not just that the TypeScript side is internally consistent — but
   it is **not** equivalent to §19 layer 3's on-device checklist (OAuth redirect, multipart upload,
   push delivery, reminder timing), none of which is exercisable without a real device or emulator,
   neither of which exists in this sandbox.

## Next intended step

Start **Phase 11 — Testing hardening** on `b-mobile-initial` (no PR), per `PLAN.md`'s phase list:

1. **Sweep for missing four-state screen tests.** §19's "one test per screen asserting its four
   loading/empty/error/loaded states" is the stated target, not a verified-complete inventory —
   check every `src/screens/SCR-*` directory against its own test file for actual coverage of all
   four states, not just that a test file exists.
2. **Pure-logic coverage gaps** — the same §19 layer-1 audit, but for `src/data/`, `src/flows/`,
   and `src/platform/`'s non-Capacitor-wrapped logic (error mapping, the write-gate selector,
   upload-queue state transitions, BBCode preset, image-cache TTL arithmetic, deep-link
   resolution — §19's own explicit list of "this is where the density should be").
3. **The manual §19 layer-3 on-device checklist is now finally attemptable in principle** — Phase
   10 produced a real, installable APK for the first time — but this sandbox still has no device
   or emulator (confirmed again this phase; not a new finding). If one becomes available in a
   future session, this is the first point where OAuth redirect, multipart upload, push delivery,
   and exact-alarm-free reminder timing can actually be exercised for real rather than only
   source-verified. Until then, keep documenting this gap rather than silently dropping it.
4. **Verify**: full monorepo `typecheck && lint && test && build`, same as every phase.

## Open decisions / blockers

None on the spec side. Still needed from the user eventually, not blocking Phase 11's start: real
`VITE_BLIPFOTO_CLIENT_ID`/`VITE_MAP_TILES_KEY`/`VITE_NOTIFY_SERVICE_URL`/
`VITE_NOTIFY_REGISTRATION_SECRET` values in a local `.env`, an actual Cloudflare account to deploy
`b-push` to (Workers + D1 + a Firebase project for FCM's service-account JSON and a real
`google-services.json`), and Android signing keys for release (§17 — kept outside the repo; debug
builds sign with the auto-generated debug keystore, which is why `assembleDebug` worked with none
of this in place). None of the OAuth round, `b-push`'s registration contract, or any live data/
action/write screen built so far has been tested against the real services for the same reason —
expected, matches the spec's own stance that this isn't a pre-build gate. **New this phase**: no
device or emulator exists in this sandbox to run the app's own APK on, so even with
`platform/http.ts`'s native transport now implemented, nothing has actually been exercised
end-to-end on a real (or virtual) device yet — Phase 10 closed the code-side gap, not the
environment-side one.

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
  from `b-api`'s own test fixtures (Phase 8), `BlipComment` missing an `unread` field entirely
  (Phase 9) despite data-model.md/app-architecture.md both describing one, and (Phase 10, the other
  direction) `updateRateLimit()`'s `headers instanceof Headers` fallback branch, written
  defensively in anticipation of exactly the native-transport case Phase 10 finally implemented —
  worth reading existing defensive code for what future gap it's already anticipating, not just
  auditing for what's missing. Keep checking — don't assume every phase finds a gap, but don't
  assume a name match (or a defensive check with no caller yet) means nothing further is needed.
- **No headless browser, and (confirmed again in Phase 10) no Android device/emulator, available
  in this sandbox** — `playwright install --with-deps` needs root; there's no `adb devices` target
  either. Verification uses jsdom-rendered Testing Library smoke tests, a real `node:sqlite`-backed
  fake for `b-push`'s D1 access (Phase 9), and — new in Phase 10 — a real `./gradlew assembleDebug`
  as the closest available substitute for on-device verification of the native Android side. None
  of these are a substitute for §19 layer 3's actual manual checklist; don't re-attempt any of the
  above sandbox-blocked tools expecting a different result, and don't claim on-device behaviour is
  verified when only compilation/packaging was.
- **`ReturnType<typeof vi.fn()>` used as a mock's declared type infers `any`, and returning `any`
  from an arrow function trips `@typescript-eslint/no-unsafe-return`** (Phase 9, reconfirmed Phase
  10 in `platform/__tests__/http.test.ts`) — always give `vi.fn<...>()` an explicit function-type
  generic, and when the mocked function itself is only ever called with a single object argument,
  type the mock and the `vi.mock()` factory to take that one argument directly rather than
  `(...args: unknown[])` — the latter fails `tsc` with "a spread argument must either have a tuple
  type or be passed to a rest parameter" once the mock has a concrete (non-`unknown[]`) signature.
- **A `Response` body can only be read once** — reusing the same mocked `Response` instance across
  multiple/concurrent `fetch()` calls throws "Body is unusable" (Phase 9). Use a fresh
  `new Response(...)` per call whenever a mocked fetch is exercised more than once in one test.
- **A JSDoc block comment containing a literal `*/` substring closes the comment early** — describe
  such patterns in words instead of embedding the literal string (Phase 9).
- **jsdom has no `Element.scrollTo`**, which `ion-segment` (and likely other Ionic components) call
  when their active item changes — fixed with a guarded shim, `packages/b-mobile/src/test-setup.ts`,
  wired into both `packages/b-mobile/vite.config.ts`'s own `test.setupFiles` _and_ the root
  `vitest.config.ts`'s. **Running a single workspace's tests directly from inside its own directory
  (`cd packages/b-push && npx vitest run` or `npm test --workspace=@b-oss/b-push`) breaks this
  setupFiles path** — the root `vitest.config.ts`'s `setupFiles: ['./packages/b-mobile/src/
test-setup.ts']` resolves relative to whatever the invoking shell's cwd was, not the config
  file's own location, so it only works when invoked from the repo root (`npx vitest run <path>`
  or `npm test` at root). Pre-existing, not something Phase 10 introduced or fixed — noted here
  because it's easy to hit by accident and momentarily look like a real test failure.
- **`ReturnType`-generic mock aside, a plain `vi.fn()`'s call history survives `vi.restoreAllMocks()`
  in `afterEach`** — that only restores spies created via `vi.spyOn()` back to their original
  implementation; a bare `vi.fn()` needs its own explicit `.mockReset()`/`.mockClear()` or its call
  count silently accumulates across tests in the same file (Phase 10, `http.test.ts`).
- **Two Zustand-selector footguns, same root cause**: a selector that returns a _newly allocated_
  value on every call breaks `useSyncExternalStore`'s reference-equality check — infinite render
  loop or silently-reverted state depending on where it bites. A close relative: an effect that
  depends on a value its own success path clears can re-trigger right after succeeding — fix with a
  `useRef` seeded once at mount rather than a reactive dependency (Phase 7).
- **A raw `element.click()` in a test doesn't reliably synchronize with a handler that chains
  multiple `await`s before its first `setState`** under this sandbox's CPU contention — default to
  `await userEvent.click(...)` over a bare `.click()`/`.dispatchEvent()`.
- **`IonAlert` renders its buttons into the DOM unconditionally, regardless of `isOpen`** — scope
  trigger queries with `{ selector: 'ion-button' }`; once a screen has multiple distinct
  destructive `IonAlert`s, scope through the alert's own `header` attribute instead.
- **`IonLabel` didn't render its children reliably in this jsdom test setup** on several screens —
  fixed by using plain `<span>`/`<strong>` children inside `IonItem` instead (not a blanket "never
  use IonLabel" rule). `IonButton`'s `aria-label` prop also didn't reach the rendered DOM attribute
  — `screen.getByText('label', { selector: 'ion-button' })` works reliably instead.
- **`b-view`'s `EntryDetail` and `ThumbnailGrid` are not reused by `b-mobile`, on purpose** —
  `EntryDetail`'s `dangerouslySetInnerHTML` conflicts with §14's ban; `ThumbnailGrid`'s windowed
  pagination doesn't fit any feed here. `EntryGrid`/`BBCodeText` were built instead.
- **`SCR-07`/`SCR-08`/`SCR-15`/`SCR-16` all deliberately avoid depending on a prior screen's
  in-memory data**, refetching via `useLiveEntry`/router state instead, for deep-link resilience.
  `SCR-10`–`SCR-13` (Phase 7) are the deliberate exception, sharing `composeDraftStore`. `SCR-23`/
  `SCR-24` (Phase 9) fit the first pattern, not the exception.
- **`changeAccountMode`'s one known deviation from auth.md's exact transition table**: documented
  in `flows/accountsFlow.ts`'s own docstring. Not a correctness bug.
- **Blipfoto's exact registration/terms/help page URLs still aren't stated anywhere in the
  spec** — `SCR-01`/`SCR-29`'s links all point at the bare `https://www.blipfoto.com` root with a
  TODO. Still open; a real navigation-team pass fills these in eventually.
- **A large third-party dependency pulled in by a single screen needs an explicit lazy-loading
  check** — inspect `npm run build`'s own chunk-size output whenever a new screen/dependency lands.
  The two >500KB chunks flagged since Phase 6/7 (`maplibre-gl`, `@ionic/react` itself) are still
  the same ones as of Phase 10 — reconfirmed unchanged this phase too, since `@capacitor/android`
  is native tooling never bundled into the web JS output at all.
- **`platform/upload.ts`'s native multipart path has never run against a real device or the real
  API** — design is source-verified (app-architecture.md §7), still worth a real device test as
  part of the manual §19 layer-3 checklist once a device/emulator is available.
- **`devicePrefsStore.uploadFullSize` has no consumer yet** — persists, defaults to `true`, but no
  client-side photo downscaling exists anywhere in this app yet.
- **`SCR-18`'s "Remove follower" is a documented, deliberate gap, not an oversight** — `SCR-19`'s
  Followers list is the correct place for it (already built, already works).
- **`android/`'s manifest permission list is deliberately redundant with what individual Capacitor
  plugins' own manifests already contribute via Gradle's manifest merger** (Phase 10) —
  `@capacitor/local-notifications` already declares `POST_NOTIFICATIONS` in its own bundled
  manifest, for instance, but app-architecture.md §17's table is the thing being satisfied, not an
  assumption that transitive plugin manifests will keep doing so as dependencies change versions.
- **`@capacitor/assets`' default adaptive-icon/splash background is plain white, not transparent
  or sampled from the source icon** — always pass an explicit `--iconBackgroundColor`/
  `--splashBackgroundColor` matching the brand, and check the _rendered_ output, not just the
  tool's log (Phase 10).
