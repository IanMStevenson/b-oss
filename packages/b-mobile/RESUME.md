# b-mobile — resume point

Rewritten at the end of every phase / major milestone. Read this first, then the last 20 entries
of `AGENT_LOG.md`, then `PLAN.md`, before doing anything else — especially if this session started
with "resume".

## Status

**Phases 0–11 are all complete.** Phase 0 (prerequisite `b-oss` refactor) is merged into `main`;
Phases 1–11 are committed on `b-mobile-initial` (confirm pushed — see "Last completed step"). The
app now has: a working Vite/Ionic/Capacitor skeleton, the full 28-screen route table, a real OAuth
round and full account-management flow, a functional write-gate, real Browse/Tag-Entries/Entry-
Detail/Full-screen-Photo/Entry-Metadata screens, a full social action bar, inline comment reply/
edit/delete/report, a working hidden-members system, real profile/followers/following/pending-
requests/refused-followers/awards screens, real Search and Map, a full compose/publish/edit
pipeline with a durable background upload queue, real Settings and Help & Info, a fully live
notification pipeline (`packages/b-push`, never deployed per its own scope boundary but fully
built/tested), a real checked-in Android native project (`packages/b-mobile/android/` — manifest,
two local plugins, notification channels, brand-correct icon/splash, a real accessibility font-
scale mechanism), and — as of Phase 11 — meaningfully hardened test coverage: two previously-
untested foundational screens (`SignInScreen`, `AccountsScreen`) now have real tests, five more
screens had missing `loading`/`error` states closed, and four pure-logic modules named explicitly
in §19 (`errors.ts`, the write-gate selector, `imageCache.ts`, `dates.ts`) now have direct unit
tests. Full monorepo `typecheck && lint && test && build` green (712 tests, confirmed stable
across repeated runs). **No Phase 12 is defined in `PLAN.md` yet** — see "Next intended step".

## Last completed step

Committed (confirm pushed — do that first if resuming) Phase 11's full scope per `PLAN.md`'s
checklist. Worth reading `AGENT_LOG.md`'s Phase 11 entry in full before touching the same modules
again — the complete reasoning is there; the short version:

1. **Two foundational screens had zero tests at all**: `SignInScreen` (SCR-01) and `AccountsScreen`
   (SCR-30) — the only screens reachable before any account exists. New test files close both
   (6 + 8 tests). Writing `AccountsScreen`'s tests reproduced the `IonLabel`-doesn't-render-
   children-in-jsdom gotcha (below) firsthand — every `<IonLabel>` in that file had to be swapped
   for a plain `<span>` before a single query would pass. The component had simply never had a
   test written against it before, so the bug had never been forced to surface.
2. **Five screens (`SCR-17-18`, `19`, `20`, `21`, `25`) were missing `loading` and/or `error`
   coverage their own component code visibly has** — not missing entirely, just skipped straight
   to a resolved fetch in every existing test. Two more (`SCR-03`, `22`) were missing only
   `loading`. 11 new tests close these. `SCR-04` (Map) was checked and deliberately left alone —
   its region fetch is non-blocking by design, so there is no loading state to test.
3. **Pure-logic gaps closed against §19's own named list, checked one by one rather than assumed**:
   `data/errors.ts#mapApiError` (7 tests — the single error mapper every call site uses, never
   directly tested despite that), the write-gate selector `state/accountsStore.ts#useCanWrite`
   (8 tests — `WriteGuardRoute.test.tsx` had only ever mocked it away, backwards for the one
   selector every write-gated route trusts blindly), `platform/imageCache.ts#resolveImage`'s TTL
   arithmetic (6 tests — its one consumer, `CachedImage.tsx`, has no test either, so this was
   completely unexercised), and `data/dates.ts` (5 tests — its own comment flags local-vs-UTC
   formatting as the thing to get right). `data/bbcode.ts` was checked and found **already**
   fully covered via `BBCodeText.test.tsx`'s existing tests — not duplicated.
4. **The sweep's largest finding wasn't a test gap — it's a missing feature.**
   `flows/deepLinkResolver.ts`, which app-architecture.md §16 names as the one module that must
   handle `bmobile://entry/:id`/`user/:username` content links and the `ACTION_SEND` share intent
   (in addition to the OAuth redirect), **does not exist**. `platform/deepLinks.ts#onAppUrlOpen`
   has exactly one consumer anywhere in the codebase — `flows/oauthRound.ts`, only for the OAuth
   redirect, only while a round is in progress. A tap on a shared entry/profile link, or a
   share-to-Blipfoto intent, currently does **nothing** — despite Phase 10 adding the Android
   manifest intent filters for exactly these paths in the same session. Not fixed in Phase 11
   (a real feature addition, not testing-hardening scope) — flagged prominently as the leading
   candidate for whichever phase comes next.
5. **A concurrent session touched `flows/accountsFlow.ts`/`app/AppShell.tsx` mid-phase** (HAPI runs
   multiple agents on this machine in parallel, same worktree) — a `devSignInWithToken()` dev-only
   helper, confirmed with the user as unrelated, already-finished work, deliberately left out of
   this phase's own commit. Their `VITE_DEV_TOKEN`-gated code path fires during `npm test` too
   (Vite loads root `.env.local` regardless of dev/test), producing a harmless but real unhandled-
   rejection warning in `AppShell.test.tsx`'s run — not a test failure (712/712 still pass,
   reproduced identically twice), not this phase's bug, not fixed here. If it's still there next
   session, it's exactly this — not a new regression to chase.

## Next intended step

**No Phase 12 is defined in `PLAN.md`.** In rough priority order, based on this phase's own
findings:

1. **Build `flows/deepLinkResolver.ts` for real** (Phase 11's largest finding, above) — parse
   `bmobile://entry/:id` and `bmobile://user/:username`, route to the right screen, gate account-
   requiring targets via `FLW-01`/`signInGated()`, and wire the `ACTION_SEND` share intent into
   `SCR-10` with the photo pre-loaded (`FLW-12`). One resolver for both cold start
   (`@capacitor/app`'s launch URL) and warm start (`appUrlOpen`), per §16's explicit requirement
   that these can't diverge. This is real, scoped feature work — plan it as its own phase rather
   than folding it into whatever comes next as an aside.
2. **Real on-device testing, if a device or emulator becomes available.** Confirmed absent again
   in Phase 11 (not a new finding) — this sandbox has had neither since Phase 0. The Phase 10 APK
   is the closest available substitute in the meantime.
3. **`devicePrefsStore.uploadFullSize` still has no consumer** (open since Phase 8) — whoever
   builds client-side photo downscaling on the compose path wires this toggle to something real.
4. **Verify**: full monorepo `typecheck && lint && test && build`, same as every phase.

## Open decisions / blockers

None on the spec side. Still needed from the user eventually, not blocking further work: real
`VITE_BLIPFOTO_CLIENT_ID`/`VITE_MAP_TILES_KEY`/`VITE_NOTIFY_SERVICE_URL`/
`VITE_NOTIFY_REGISTRATION_SECRET` values in a local `.env`, an actual Cloudflare account to deploy
`b-push` to (Workers + D1 + a Firebase project for FCM's service-account JSON and a real
`google-services.json`), and Android signing keys for release (§17 — kept outside the repo; debug
builds sign with the auto-generated debug keystore). None of the OAuth round, `b-push`'s
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
- **`flows/deepLinkResolver.ts` does not exist, despite app-architecture.md §16 requiring it and
  Phase 10 already adding the Android manifest intent filters that assume it does** (Phase 11) —
  `platform/deepLinks.ts#onAppUrlOpen` has exactly one consumer anywhere (`flows/oauthRound.ts`,
  OAuth redirect only, only mid-round). Content links and the share intent are currently silent
  no-ops on a real device. See RESUME's "Next intended step" — this is real, scoped feature work,
  not something to build as a side effect of an unrelated phase.
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
