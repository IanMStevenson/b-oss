# b-mobile — resume point

Rewritten at the end of every phase / major milestone. Read this first, then the last 20 entries
of `AGENT_LOG.md`, then `PLAN.md`, before doing anything else — especially if this session started
with "resume".

## Status

**Phases 0–12 are all complete, plus the off-sequence Phase 12.6 b-view-reuse adoption and Phase
12.7 feedback-polish round.** Phase 0 (prerequisite `b-oss` refactor) is merged into `main`; Phases
1–12, 12.6, and 12.7 are committed on `b-mobile-initial` (confirm pushed — see "Last completed
step"). The app now has: a working Vite/Ionic/Capacitor skeleton, the full 28-screen route table, a
real OAuth round and full account-management flow (including, as of 12.7, an embedded-WebView
"force new sign-in" option for adding a second account without sharing the system browser's
cookies), a functional write-gate, real Browse/Tag-Entries/Entry-Detail/Full-screen-Photo/Entry-
Metadata screens — as of 12.6, `EntryGrid`/`PhotoScreen`/`EntryDetailScreen` all compose `b-view`'s
shared `ThumbnailGrid`/`Lightbox`/`EntryDetail` directly rather than hand-built equivalents — a full
social action bar, inline comment reply/edit/delete/report (as of 12.7, real member badges next to
usernames throughout), a working hidden-members system, real profile/followers/following/pending-
requests/refused-followers/awards screens (as of 12.7, Awards correctly distinguishes earned from
unearned catalog entries), real Search and Map, a full compose/publish/edit pipeline with a durable
background upload queue, real Settings (as of 12.7, split into account-backed vs. device-local
groups, with a new Browsing display-prefs section and `ThumbnailGrid` pinch-to-zoom) and Help &
Info, a fully live notification pipeline (`packages/b-push`, never deployed per its own scope
boundary but fully built/tested), a real checked-in Android native project
(`packages/b-mobile/android/` — manifest, three local plugins including `ShareIntentPlugin` from
Phase 12, notification channels, brand-correct icon/splash, a real accessibility font-scale
mechanism), meaningfully hardened test coverage from Phase 11, and — as of Phase 12 — a genuinely
finished app rather than one with known open wiring gaps: the shared overlay mechanism, the
account-switcher popover, a real deep-link/share-intent resolver, the app-resume permission
recheck, and a fully wired typed copy deck are all in place. Full monorepo
`typecheck && lint && test && build` green (854 tests, reconfirmed 2026-08-30). **Only Phase 13
(deploy/test `b-push`) remains, and it's still blocked on the user providing Cloudflare/Firebase
credentials** — see "Phase 13" below.

## Last completed step

Phase 12.7 (2026-08-08 through 2026-08-14, logged retroactively 2026-08-30 — see `AGENT_LOG.md`'s
Phase 12.7 entry for full detail, including exact commit hashes). A feedback-polish round run
across several sessions plus the user's own direct commits, not a single planned unit of work.
Three threads:

1. **Root-cause bug fixes surfaced by testing against real API data/devices, not by inspection** —
   most notably `getClient()` reading `accountsStore` before hydration finished, the single cause
   behind three separately-reported "bugs" (me-awards, me-refused/me-requests, four different
   settings screens all showing "Could not load"); fixed with a new `state/authReady.ts` gate.
   Also: `verifyToken()` (`b-api`) not unwrapping `GET oauth/token`'s envelope, `ProfileScreen`'s
   own-profile fetch using the wrong username variable, and `user/awards.json` returning the full
   award catalog (not just earned awards) with `AwardsScreen.tsx` rendering every entry as earned.
2. **Screen redesigns driven directly by user screenshot feedback** — a shared `AppHeader` across
   every screen, a real-badge redesign of the Comments inbox and every people-list row, real icon-
   guide content (replacing invented content that didn't match blipfoto.com), a Settings hub split
   into account-backed vs. device-local sections plus a new Browsing display-prefs section, and
   several smaller copy/spacing fixes.
3. **Native/platform fixes** — Android's `CapacitorHttp` force-parsing JSON responses regardless of
   `responseType`, missing safe-area padding on `IonMenu`/scrollable `IonContent`, and a new
   embedded-WebView "force new sign-in" option (its native cookie-clearing path still needs a
   real-device check — no adb connection was available when it was built).

Before that: Phase 12.6's full scope (2026-08-05) — rebased onto `origin/main` to pull in `b-oss`
PR #67, then rewrote `EntryGrid`/`PhotoScreen`/`EntryDetailScreen` to compose `b-view`'s shared
`ThumbnailGrid`/`Lightbox`/`EntryDetail` directly, deleting the now-redundant local `bbcode.ts`/
`BBCodeText.tsx`. Found and fixed four small, real gaps in `b-view`'s own `EntryDetail`/`Lightbox`
along the way (`onLinkClick`, `onFullscreen`, `onTagClick`, `Lightbox`'s `onImageError`), verified
visually via `.claude/skills/run-b-view`, not just by test assertion. Two gaps accepted rather than
fixed: the `reactions` slot can't independently hide just Star or just Favourite; `EntryDetail`'s
own inline location pin isn't WebView-safe. Full detail in `AGENT_LOG.md`'s Phase 12.6 entry.

For Phase 12's own scope (`OverlayProvider`/`useOverlay`, the account-switcher popover,
`flows/deepLinkResolver.ts`, the app-resume hook, the typed copy deck) and older Phase 11 history,
see `AGENT_LOG.md`'s Phase 12 and Phase 11 entries directly — not repeated here to keep this file
from growing without bound.

## Phase 12 wishlist — DONE (compiled 2026-08-04, reviewed with the user same day, completed 2026-08-05)

All five items (overlay mechanism, account-switcher popover, `flows/deepLinkResolver.ts`,
`platform/appState.ts`'s resume hook, TODO F/G copy-deck wiring) are complete — see "Last completed
step" above and `AGENT_LOG.md`'s Phase 12 entry for full detail. Two loose ends left inline rather
than fixed as a side effect of this phase, both real but neither urgent:

- **`WriteGuardRoute.tsx`'s own `IonAlert` duplicates `OverlayProvider`'s shared upgrade prompt**
  (predates it) — both now read the same `TextStrings.csv` keys so they can't drift on content, but
  the duplicate itself is still there because `WriteGuardRoute`'s decline action needs
  `history.goBack()`, which `OverlayState` has no per-caller hook for. Retiring it needs an
  optional on-decline callback added to `OverlayState` first.
- **`data/useResource.ts`/`usePagedResource.ts` don't route through `mapApiError`/`describeError`**
  — all 28 loading/error surfaces still show whatever `Error.message` was thrown verbatim, same as
  before Phase 12. Deliberately not changed: the primitive doesn't currently see the original
  error, only its `.message`, so wiring it through would be a real architectural change with no way
  to visually verify the result in this sandbox, and neither TODO F nor TODO G named it as a gap.
  `data/entries.ts#fetchEntry`/`data/users.ts#fetchUserProfile` show the narrower alternative
  already used successfully this phase — rewrite the message at the specific fetcher that needs
  specific handling, not the shared primitive.

**Explicitly parked, not forgotten** — deliberate scope decisions from the user, not gaps to
silently backfill:

- **Android signing keys + a real `applicationId`** — not needed while there's no commitment to
  publishing. Debug builds already work with the auto-generated debug keystore; revisit only once
  a Play submission is actually planned.
- **Real on-device/emulator testing** — deferred until a decent chunk of testing has happened in
  Vite's browser-mode dev server first (now unblocked — `VITE_BLIPFOTO_CLIENT_ID`/
  `VITE_OAUTH_REDIRECT_URI`/`VITE_DEV_TOKEN` are already populated in the root `.env.local`, so
  signed-in screens are reachable in a desktop browser via the other session's `devSignInWithToken`
  path). Still no device/emulator in this sandbox regardless.

## Phase 13 (per the user, 2026-08-04): deploy and test the notification service

Deploy `b-push` for real (Cloudflare Workers + D1 + a Firebase project for FCM's service-account
JSON) and test it to whatever extent is possible without a fully complete system (no Android
signing/publishing, per the parked item above). Blocked on the user providing: a Cloudflare
account, `VITE_NOTIFY_SERVICE_URL`/`VITE_NOTIFY_REGISTRATION_SECRET` (currently empty in
`.env.local`), and Firebase project credentials. `b-push` itself has been fully built and tested
against a local SQLite fake since Phase 9 — this phase is deployment and real-world verification,
not new application code.

## Questions for the user (blocking, not urgent — collect when convenient)

- ~~The five hardcoded Blipfoto URLs~~ — **resolved 2026-08-04**, see below.
- ~~`photoValidation.ts`'s minimum photo dimension~~ — **resolved 2026-08-05**, see "Photo upload
  limits" below.
- ~~`VITE_MAP_TILES_KEY`~~ — **resolved 2026-08-05**, the user populated it in the root
  `.env.local` directly (a MapTiler Cloud key). No code change needed — `getMapStyleUrl()` already
  reads it and only fell back to `null`/`SCR-04`'s "unavailable" state for its absence.
- **Nothing else currently blocking.** Only remaining open item is Phase 13's Cloudflare/Firebase
  credentials, tracked separately below (not a "question", a hard external dependency).

### Blipfoto URLs — resolved 2026-08-04

User-supplied, wired into `SignInScreen.tsx`/`HelpInfoScreen.tsx` this session:

| Row                        | URL                                                 |
| -------------------------- | --------------------------------------------------- |
| `SCR-01` Create account    | `https://www.blipfoto.com/account/signup`           |
| `SCR-29` Help              | `https://www.blipfoto.com/help`                     |
| `SCR-29` Terms & legal     | `https://www.blipfoto.com/legal/terms`              |
| `SCR-29` Privacy policy    | `https://www.blipfoto.com/legal/privacy`            |
| `SCR-29` Delete my account | `https://www.blipfoto.com/settings/profile#sidebar` |

Two more URLs the user supplied that don't map onto the spec's single-row-per-link wireframe:
`https://www.blipfoto.com/legal/acceptable-use` and `https://www.blipfoto.com/be-excellent`
("Be Excellent to Each Other" community guidelines). Both added as new outbound links inside the
existing in-app **Safety & privacy** section instead (`SCR-29`'s "what you can do about someone
else's behaviour" explainer) — that's the section already covering community conduct, and it
keeps `SCR-29`'s wireframe-specified "Terms & legal" as the one row → one destination the spec
draws it as. Not a spec deviation the user asked for explicitly; flagged here as a judgment call
in case a future navigation-team pass wants it placed differently.

### Photo upload limits — resolved 2026-08-05

User-supplied, read from Blipfoto's own server source (`Image.php`/`JPG.php`/`AvatarUploader.php`)
— not stated anywhere in AppSpec/ImplementationSpec, which is why `photoValidation.ts`'s
`MIN_DIMENSION = 200` sat as a placeholder through Phase 11:

|               | Entry photos                                                      | Avatar photos              |
| ------------- | ----------------------------------------------------------------- | -------------------------- |
| Min dimension | 600px on **at least one** edge                                    | 300px on at least one edge |
| Max dimension | None — originals stored as-is, only derived renditions downscaled | None documented            |
| Max file size | 20 MB (S3 upload policy)                                          | 3 MB (hard-coded check)    |
| Min file size | 1 KB (S3 policy)                                                  | None documented            |

Wired into `data/photoValidation.ts#validatePickedPhoto()` the same session, now taking a
`purpose: 'entry' | 'avatar'` parameter (previously one shared `MIN_DIMENSION` for both call
paths — genuinely wrong, not just imprecise, since entry/avatar limits differ). **The "at least
one edge" wording matters**: the previous placeholder rejected unless _both_ width and height
cleared the floor; the real rule only requires one, so a thin panorama or a tall crop that used to
fail now correctly passes. File-size checking is new — `platform/camera.ts`'s `PickedPhoto`
didn't carry a byte size at all before this (the `@capacitor/camera` plugin's `MediaMetadata.size`
was available via the already-passed `includeMetadata: true` but silently dropped in
`toPickedPhoto()`); now threaded through `PickedPhoto` → `state/composeDraftStore.ts`'s
`ComposePhoto` → the validator, nullable throughout (unknown size skips that check, same
null-safety precedent already used for unknown width/height). No maximum-dimension check exists
or is needed — confirmed, not assumed, since Blipfoto itself never rejects on it.

## Environment status (checked 2026-08-05, keys only — not values)

Root `.env.local` (gitignored) currently has: `VITE_BLIPFOTO_CLIENT_ID`, `VITE_OAUTH_REDIRECT_URI`,
`VITE_DEV_TOKEN`, `VITE_MAP_TILES_KEY` **populated**; `VITE_NOTIFY_SERVICE_URL`,
`VITE_NOTIFY_REGISTRATION_SECRET` **empty**; `MAIN_VITE_BLIPFOTO_CLIENT_ID`,
`VITE_CHROME_CLIENT_ID` **populated** (b-ark/b-ark-chrome's own keys, unrelated to b-mobile).
Matches expectations: the app is registered with Blipfoto, browser-mode dev sign-in works, and the
map now has real tiles; only `b-push`'s two keys remain empty, blocked on Phase 13's Cloudflare
deployment.

## Next intended step

**Phase 13 is next, and it's blocked** — deploy `b-push` needs the user to provide a Cloudflare
account and Firebase project credentials (see "Phase 13" above); nothing to do on the code side
until then. The feedback-polish cycle (Phase 12.7 and whatever comes after it) is otherwise
open-ended and user-driven — check `/home/ims/dev/tmp/b-mobile-screenshots/feedback.md` for
un-actioned entries before assuming there's nothing left there; it lives outside this repo (a
scratch dir, not checked in) so it won't show up in `git log`.

If picking up code-only work with no open feedback item to drive it, the honest candidates are:
the two loose ends flagged in "Phase 12 wishlist — DONE" above (giving `OverlayState` an
on-decline callback so `WriteGuardRoute.tsx`'s duplicate `IonAlert` can retire, or reconciling
`useResource`'s generic error text against the deck — still untouched as of Phase 12.7); the two
gaps 12.6 found and deliberately left as accepted, documented limitations (`EntryDetail`'s single
`reactions` slot can't independently hide just Star or just Favourite; its own inline location pin
isn't routed through Capacitor's Browser plugin the way its description/comment links now are, via
`onLinkClick`) — see `AGENT_LOG.md`'s Phase 12.6 entry for the full reasoning on both; or Phase
12.7's own carried-forward item, a real-device sign-in check of the new embedded-WebView "force new
sign-in" cookie-clearing path (`614be11`), never exercised outside the build — see `AGENT_LOG.md`'s
Phase 12.7 entry. None of these was asked for; check with the user before starting any of them.
Verify with the standard full monorepo `typecheck && lint && test && build` once anything lands,
same as every phase.

## b-view reuse — done (Phase 12.6, 2026-08-05)

Not part of this branch's own phase sequence (same footing as Phase 12's own wishlist) — this
section used to track the adoption as blocked-then-ready; now folded into "Last completed step"
above and `AGENT_LOG.md`'s Phase 12.6 entry, which has the full detail (including four small, real
gaps found and fixed in `b-view`'s own `EntryDetail`/`Lightbox` along the way — `onLinkClick`,
`onFullscreen`, `onTagClick`, `Lightbox`'s `onImageError` — and two deliberately left as accepted
limitations rather than a fifth/sixth). `EntryGrid.tsx`/`PhotoScreen.tsx`/`EntryDetailScreen.tsx`
now all compose `b-view`'s `ThumbnailGrid`/`Lightbox`/`EntryDetail` directly, and the local
`bbcode.ts`/`BBCodeText.tsx` are gone in favour of `@b-oss/b-view`'s promoted versions. Nothing
left to do here.

## Open decisions / blockers

None on the spec side. Still needed from the user eventually, not blocking further work: an actual
Cloudflare account to deploy `b-push` to (Workers + D1 + a Firebase project for FCM's
service-account JSON and a real `google-services.json`, populating `VITE_NOTIFY_SERVICE_URL`/
`VITE_NOTIFY_REGISTRATION_SECRET`), and Android signing keys for release (§17 — kept outside the
repo; debug builds sign with the auto-generated debug keystore). None of the OAuth round, `b-push`'s
registration contract, or any live data/action/write screen built so far has been tested against
the real services for the same reason — expected, matches the spec's own stance that this isn't a
pre-build gate. Still no device or emulator in this sandbox to run the app's own APK on (unchanged
since Phase 10).

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
- **Headless browser verification is now possible, updating earlier phases' "no headless browser
  available" note** — a separate `b-oss` session got real headless Chromium working on this
  machine 2026-08-05 (see `b-oss` PR #68, `.claude/skills/run-b-view`): `playwright-core` is a root
  devDependency, and the ~62 missing system libraries were installed via `sudo env "PATH=$PATH"
npx playwright install-deps chromium` (a one-time, machine-level, human-run step — an agent
  session still can't do this itself, no interactive sudo password). After that,
  `chromium.executablePath()` resolves automatically. Still true, unchanged: **no Android
  device/emulator available in this sandbox** (confirmed again Phase 10) — there's no `adb devices`
  target. Verification still uses jsdom-rendered Testing Library smoke tests, a real
  `node:sqlite`-backed fake for `b-push`'s D1 access (Phase 9), and a real `./gradlew
assembleDebug` as the closest available substitute for on-device verification of the native
  Android side — but a real headless-browser pass (Vite dev server + Playwright, per
  `run-b-view`) is now a genuine option for the web/Ionic side too, not just jsdom. None of these
  are a substitute for §19 layer 3's actual manual checklist; don't claim on-device behaviour is
  verified when only compilation/packaging (or a desktop-browser headless pass) was.
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
- ~~`b-view`'s `EntryDetail` and `ThumbnailGrid` are not reused by `b-mobile`, on purpose —
  `EntryDetail`'s `dangerouslySetInnerHTML` conflicts with §14's ban; `ThumbnailGrid`'s windowed
  pagination doesn't fit any feed here. `EntryGrid`/`BBCodeText` were built instead.`~~ —
**done, Phase 12.6 (2026-08-05).** `EntryGrid.tsx`/`PhotoScreen.tsx`/`EntryDetailScreen.tsx`all
compose`b-view`'s `ThumbnailGrid`/`Lightbox`/`EntryDetail`directly now; the local`bbcode.ts`/`BBCodeText.tsx`are gone. See "b-view reuse — done" above and`AGENT_LOG.md`'s Phase
12.6 entry for the adoption's own real findings (a background auto-load-more bridge over
`ThumbnailGrid`'s client-side-only pagination; a sentinel-based hidden-tile placeholder; four
small new optional `b-view` props found necessary along the way).
- **`SCR-07`/`SCR-08`/`SCR-15`/`SCR-16` all deliberately avoid depending on a prior screen's
  in-memory data**, refetching via `useLiveEntry`/router state instead, for deep-link resilience.
  `SCR-10`–`SCR-13` (Phase 7) are the deliberate exception, sharing `composeDraftStore`. `SCR-23`/
  `SCR-24` (Phase 9) fit the first pattern, not the exception.
- **`changeAccountMode`'s one known deviation from auth.md's exact transition table**: documented
  in `flows/accountsFlow.ts`'s own docstring. Not a correctness bug.
- **Blipfoto's exact registration/terms/help/privacy/delete-account URLs weren't stated anywhere
  in the spec** — resolved 2026-08-04, the user supplied all five real destinations directly (see
  "Blipfoto URLs — resolved" above). No longer open.
- **A large third-party dependency pulled in by a single screen needs an explicit lazy-loading
  check** — inspect `npm run build`'s own chunk-size output whenever a new screen/dependency lands.
  The two >500KB chunks flagged since Phase 6/7 (`maplibre-gl`, `@ionic/react` itself) are still
  the same ones as of Phase 10 — reconfirmed unchanged this phase too, since `@capacitor/android`
  is native tooling never bundled into the web JS output at all.
- **`platform/upload.ts`'s native multipart path has never run against a real device or the real
  API** — design is source-verified (app-architecture.md §7), still worth a real device test as
  part of the manual §19 layer-3 checklist once a device/emulator is available.
- **`devicePrefsStore.uploadFullSize` has no consumer yet** — persists, defaults to `true`, but no
  client-side photo downscaling exists anywhere in this app yet. As of the feedback-polish round
  that ended 2026-08-12, `MiscSection.tsx`'s checkbox is disabled and its copy says so plainly
  (it previously implied downscaling worked); the underlying feature itself is still unbuilt — see
  `TODO.md`.
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
- ~~`flows/deepLinkResolver.ts` does not exist~~ — **built in Phase 12** (12.3). No longer open;
  see `AGENT_LOG.md`'s Phase 12 entry.
- **`@capacitor/app`'s `appUrlOpen`/`getLaunchUrl()` can never see an `ACTION_SEND` share intent's
  binary extras — only VIEW-action launch URLs** (Phase 12, discovered while building FLW-12's
  share-to-Blipfoto entry point) — there's no app-layer workaround; closing a share-intent gap
  needs genuine new native code (a custom `@CapacitorPlugin` reading `Activity.getIntent()`
  directly), not just wiring the existing plugin surface differently. `ShareIntentPlugin.java` is
  the precedent to copy for any future share-target work.
- **`IonModal`/`IonPopover`'s `present()` throws "framework delegate is missing" in this jsdom test
  setup** (Phase 12, `OverlayProvider.tsx`'s first-run explainer) — no fix found, and no precedent
  anywhere else in the codebase using either component. Use a plain styled `<div role="dialog">`
  instead for anything that needs a sheet/panel-style overlay and also needs a test.
- **This machine runs multiple concurrent Claude Code / HAPI sessions that can share the same
  worktree** — confirmed happening live during Phase 11 (root `CLAUDE.md`'s documented 2026-07-30
  incident is exactly this scenario). If a file you didn't touch shows as modified mid-session,
  check `ps aux` for other `claude`/`hapi` processes and `git diff` the file before assuming it's a
  linter/formatter artifact — it may be substantive, in-progress work from another session. Confirm
  with the user before building on it, reverting it, or including it in your own commit.
- **A mock module's return value that's a plain object (not wrapped in `new Response(...)`) can
  desync from what the real dependency returns without TypeScript catching it** — when mocking
  `@capacitor/filesystem`/`@capacitor/file-transfer`-style APIs (Phase 11,
  `platform/imageCache.test.ts`), a `vi.fn()` with no configured resolved value returns `undefined`
  synchronously; calling `.catch()` or `.then()` on that throws a TypeError that gets silently
  swallowed by whatever `try/catch` wraps the call, producing a confusing "wrong branch taken"
  failure rather than an obvious one. Always give every mocked async method in a multi-call chain
  an explicit `mockResolvedValue`/`mockRejectedValue`, even ones a given test doesn't think it
  needs, if the code under test calls them unconditionally.
- **`user/awards.json` returns the account's full award catalog, not just what's been earned** —
  confirmed 2026-08-11 against a live response: a test account with only 2 real awards still got
  back all 12 catalog entries, with `added_stamp: null` on the unearned 10. `BlipAward` already
  typed `added_stamp`/`secret` correctly, but `AwardsScreen.tsx` ignored both and rendered every
  entry as earned — a real bug, not a display choice, fixed in the 2026-08-12 feedback-polish
  round. Award names (`AWARD_SLUGS` in `AwardsScreen.tsx`) came from a slug/icon-URL table the user
  supplied directly in chat, not from any Blipfoto API or public doc — there's no endpoint that
  returns award names/meanings. `awardLabel()` shows "Secret" purely off each award's own `secret`
  flag (not `added_stamp`), on the assumption the API clears `secret` once earned — unverified
  against a live earned-secret-award response, since no test account has one.
- **Anything reading `accountsStore` on mount must await `state/authReady.ts` first** (Phase 12.7,
  `9ce73b0`) — hydration (and, in dev/browser-testing, the `VITE_DEV_TOKEN` seed) is async;
  `activeAccountId` being unset while it's still in flight looks identical to "signed out," so a
  screen/fetcher that reads the store too early silently takes the signed-out branch instead of
  erroring loudly. `getClient()` already awaits it; anything new that reads the store directly
  (bypassing `getClient()`) needs to as well, or it'll reproduce the exact bug this fixed.
- **Android's `CapacitorHttp` ignores `responseType: 'text'` whenever the response's
  `Content-Type` is `application/json`** (Phase 12.7, `f34b7f3`) — hands back an already-parsed
  object instead of a string, breaking any code (like `platformFetch`) that assumes a string
  contract unconditionally and calls `JSON.parse` on it itself. Re-stringify if what comes back
  isn't already a string; don't assume `responseType` is honoured on native.
- **`IonHeader`/`IonToolbar` reserve safe-area padding automatically; nothing else does** (Phase
  12.7, `40526a0`) — any screen area with no `IonHeader` above it (e.g. `IonMenu`'s content) or no
  `IonFooter` below scrollable content needs its own explicit safe-area padding, or content renders
  under the status bar / gesture nav bar on a real device. Confirmed via CDP against live device
  insets (34px top / 48px bottom), not guessed — check actual insets again if this needs revisiting
  rather than reusing these exact numbers on a different device class.
