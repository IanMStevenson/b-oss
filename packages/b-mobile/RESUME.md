# b-mobile — resume point

Rewritten at the end of every phase / major milestone. Read this first, then the last 20 entries
of `AGENT_LOG.md`, then `PLAN.md`, before doing anything else — especially if this session started
with "resume".

## Status

**Phases 0–12 are all complete.** Phase 0 (prerequisite `b-oss` refactor) is merged into `main`;
Phases 1–12 are committed on `b-mobile-initial` (confirm pushed — see "Last completed step"). The
app now has: a working Vite/Ionic/Capacitor skeleton, the full 28-screen route table, a real OAuth
round and full account-management flow, a functional write-gate, real Browse/Tag-Entries/Entry-
Detail/Full-screen-Photo/Entry-Metadata screens, a full social action bar, inline comment reply/
edit/delete/report, a working hidden-members system, real profile/followers/following/pending-
requests/refused-followers/awards screens, real Search and Map, a full compose/publish/edit
pipeline with a durable background upload queue, real Settings and Help & Info, a fully live
notification pipeline (`packages/b-push`, never deployed per its own scope boundary but fully
built/tested), a real checked-in Android native project (`packages/b-mobile/android/` — manifest,
three local plugins now including `ShareIntentPlugin` from Phase 12, notification channels,
brand-correct icon/splash, a real accessibility font-scale mechanism), meaningfully hardened test
coverage from Phase 11, and — as of Phase 12 — a genuinely finished app rather than one with known
open wiring gaps: the shared overlay mechanism, the account-switcher popover, a real deep-link/
share-intent resolver, the app-resume permission recheck, and a fully wired typed copy deck are
all in place. Full monorepo `typecheck && lint && test && build` green (803 tests, confirmed
stable across repeated runs). **Only Phase 13 (deploy/test `b-push`) remains, and it's blocked on
the user providing Cloudflare/Firebase credentials** — see "Phase 13" below.

## Last completed step

Committed (confirm pushed — do that first if resuming) Phase 12's full scope. Worth reading
`AGENT_LOG.md`'s Phase 12 entry in full before touching the same modules again; the short version:

1. **`OverlayProvider`/`useOverlay` finished for real** (12.1) — went from a dead stub to the
   shared mechanism every upgrade-prompt/first-run/account-switcher overlay now routes through,
   per the user's explicit "use the shared mechanism, not per-screen local state." Wiring the new
   account-switcher indicator into ~14 screens' toolbars surfaced `useOverlay must be used within
OverlayProvider` failures across their existing tests — fixed by wrapping each render call site.
2. **Account-switcher popover built** (12.2) — `AccountSwitcherOverlay`/`AccountIndicator`, wired
   into eight screens' toolbars, reusing `AccountsScreen.tsx`'s own `modeLabel()`.
3. **`flows/deepLinkResolver.ts` built for real** (12.3, Phase 11's largest finding) — handles the
   OAuth redirect (recognised, ignored), `bmobile://entry/:id`/`user/:username`, and the opt-in
   `blipfoto.com/...` web-link shapes, reusing `data/notifications.ts`'s existing path-parsing
   rather than duplicating it. **Genuine scope escalation, reasoned through rather than deferred**:
   `@capacitor/app` cannot see `ACTION_SEND` share intents at all, so FLW-12's share-to-Blipfoto
   entry point needed real new native code — `ShareIntentPlugin.java` (a third local, non-npm
   plugin), wired through `platform/shareIntent.ts`'s `checkForSharedImage()`/
   `takePendingSharedPhoto()` split (the photo has to survive `/compose`'s `WriteGuardRoute` gate,
   which can run an async OAuth round before `NewEntryScreen` ever mounts to claim it).
4. **`platform/appState.ts`'s resume hook implemented for real** (12.4) — a real
   `@capacitor/app` `appStateChange` wrapper, wired so `AppShell.tsx` re-runs
   `pushFlow.ts#runLaunchBackstopCheck()` on every resume, not only at launch (rules.md: "re-check
   the permission when the app resumes").
5. **TODO F/G's copy deck wired for real** (12.5) — `scripts/generate-strings.mjs` turns
   `TextStrings.csv` into a typed `src/strings/deck.ts` (182 keys); `mapApiError`'s `validation`
   outcome now classifies every write/validation code error-codes.md documents; a new
   `describeError()` helper replaced ~30 hand-duplicated ternaries across 16 screens (and fixed a
   real pre-existing bug those ternaries all shared — `rate-limited`/`upgrade-prompt` messages were
   being silently discarded); reconciled the specific ad hoc strings that were correctness-bearing
   (upgrade prompt, SCR-06's 104/202, SCR-18's 101/103, the favourite-quota message) against the
   real deck. Found (not fully fixed) along the way: `WriteGuardRoute.tsx` has its own duplicate
   `IonAlert` predating `OverlayProvider` — now reads the same deck keys, but a real consolidation
   needs `OverlayState` to grow an on-decline callback first (see "Open decisions" below).
6. **91 new tests, 712 → 803**, full monorepo `typecheck && lint && test && build` green twice.

For the older Phase 11 history (foundational-screen test gaps, the four-state sweep, the pure-logic
coverage sweep), see `AGENT_LOG.md`'s Phase 11 entry directly — not repeated here to keep this file
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
until then. If picking up code-only work in the meantime, the two loose ends flagged in "Phase 12
wishlist — DONE" above are the honest candidates: giving `OverlayState` an on-decline callback so
`WriteGuardRoute.tsx`'s duplicate `IonAlert` can retire, or reconciling `useResource`'s generic
error text against the deck (deliberately not attempted in Phase 12 — see that section for why).
Neither was asked for; check with the user before starting either. Verify with the standard full
monorepo `typecheck && lint && test && build` once anything lands, same as every phase.

**Also pending, from a separate `b-oss` session — see "b-view reuse" below**: `b-oss` PR #67
(`b-view-mobile-reuse`) **merged to `main` 2026-08-05T08:09:20Z.** The reasons this file's own
"Gotchas" section gave for `EntryGrid`/`BBCodeText`/`PhotoScreen`'s custom code existing are no
longer valid, and this is now genuinely actionable — the only remaining step before starting is
`git fetch && git rebase origin/main` on `b-mobile-initial` (not yet done as of this note) to pull
in the merged `b-view` changes.

## b-view reuse — ready to start (added 2026-08-05, updated same day once PR #67 merged)

Not part of this branch's own phase sequence — flagged here so it isn't lost across the hiatus.
A separate `b-oss` session (not on `b-mobile-initial`) worked through *why* `b-view`'s components
weren't reused here (see this file's "Gotchas" entry below, and `b-oss`'s PR #67 description for
the full reasoning) and found both reasons were spec-execution gaps, not real conflicts, once
checked against the user's actual intent:

- `EntryDetail`'s `dangerouslySetInnerHTML` — **fixed at the `b-view` level**: `BBCodeText`
  (`@bbob/react`-based, parses to real React elements, no raw HTML injection) has been promoted
  from this package into `b-view` itself, so `EntryDetail` no longer violates §14 for anyone.
- `ThumbnailGrid`'s windowed pagination "doesn't fit any feed here" — **the premise was wrong**:
  the user confirmed infinite scroll was never the intended design for this app; pagination (with
  `ThumbnailGrid`'s existing thumbnail-size/zoom controls) is what's actually wanted. `SCR-06`/
  `SCR-07`'s AppSpec docs also have a real, separate error worth knowing about regardless of this
  adoption work: they say tapping the main photo opens `SCR-07` full-screen, which isn't how the
  live Blipfoto site works — the live site (and `b-view`'s `EntryDetail`, now) uses a dedicated
  fullscreen button next to the star/heart reaction counts instead.

`b-view` also gained, this session: optional interactive slots on `EntryDetail` (`reactions`,
`commentComposer`, `entryActions`, `renderCommentActions` — all opt-in, so ownership/write-action
logic stays entirely host-side, not `b-view`'s concern) plus pinch/pan zoom and swipe-left/right
navigation in `Lightbox`/`EntryDetail`/`ThumbnailGrid` (touch capability isn't mobile-specific, so
it lives in `b-view` itself now, gated by touch input rather than platform).

**PR #67 has merged — this is now the next real adoption phase here** (not started yet as of this
note): rebase `b-mobile-initial` onto the updated `main`; delete `EntryGrid.tsx`'s custom
tile/grid logic and render `<ThumbnailGrid>` from `@b-oss/b-view` directly; delete
`PhotoScreen.tsx`'s hand-built `TransformWrapper` zoom code and render `<Lightbox>` directly;
rewrite `EntryDetailScreen.tsx` to compose `<EntryDetail>` with the new slots (its existing
`starEntry`/`favoriteEntry`/`commentsFlow`/`deleteEntry`/`useAccountConfirmGate` logic doesn't
move, it just fills the slots); delete this package's local `src/data/bbcode.ts`/
`src/components/BBCodeText.tsx` in favour of importing from `@b-oss/b-view`; and correct
`docs/AppSpec/screens/SCR-06-entry-detail.md`/`SCR-07-full-screen-photo.md` to remove the
"photo tap → SCR-07" language and describe the fullscreen button instead. Full phase-by-phase
detail lives in the `b-oss` session's plan file and PR #67's description — read those first
rather than re-deriving the reasoning from scratch.

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
- ~~`b-view`'s `EntryDetail` and `ThumbnailGrid` are not reused by `b-mobile`, on purpose —
  `EntryDetail`'s `dangerouslySetInnerHTML` conflicts with §14's ban; `ThumbnailGrid`'s windowed
  pagination doesn't fit any feed here. `EntryGrid`/`BBCodeText` were built instead.`~~ —
  **superseded 2026-08-05, both reasons no longer hold.** `b-view` fixed the `dangerouslySetInnerHTML`
  conflict itself (see "b-view reuse" above); the pagination premise was also just wrong — the user
  confirmed infinite scroll was never the intended design, pagination was. Don't build further on
  the old reasoning; see the "b-view reuse" section above for the actual adoption plan — `b-oss`
  PR #67 has merged, so this is now ready to start.
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
