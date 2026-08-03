# Application architecture

How the app itself is built. The counterpart to
[`notification-service.md`](notification-service.md), which specifies the one backend component the
app depends on, and the continuation of [`platform-and-reuse.md`](platform-and-reuse.md), which
settles the platform (Capacitor) and the reuse plan and then deliberately stops.

**Status:** v1.3, 2026-08-03 — **no open questions.** Reviewed three times; the naming, multipart,
push, BBCode, cropping, link-gating and deep-link-scheme questions are all resolved and folded in,
and the last of them ([Q5](#q5), hidden-member filtering) closed once it was established that the
notification API cannot supply an actor at all. Every decision below is made rather than deferred,
and each carries its reasoning so it can be argued with. The remaining work is the `b-oss` code
changes in [§21](#21-what-this-changes-elsewhere), none of which is a question.

**Scope.** This document specifies *how the app is built*: package layout, runtime stack,
navigation, state, networking, storage, and every native capability the spec relies on. It does not
restate behaviour — [`AppSpec/`](../AppSpec/) owns that, and this document cross-references it
rather than paraphrasing. Where an architectural choice constrains behaviour (there are three such
places, all flagged), that is called out explicitly rather than quietly resolved.

**Library versions** are as checked on **2026-08-03** and stated so the implementer starts from a
known-good set rather than whatever `@latest` resolves to on the day.

---

## Contents

1. [What makes this app's architecture unusual](#1-what-makes-this-apps-architecture-unusual)
2. [Repository and package layout](#2-repository-and-package-layout)
3. [Runtime stack](#3-runtime-stack)
4. [The platform boundary](#4-the-platform-boundary)
5. [Navigation and routing](#5-navigation-and-routing)
6. [State management](#6-state-management)
7. [Networking and the `b-api` seams](#7-networking-and-the-b-api-seams)
8. [Authentication and secure token storage](#8-authentication-and-secure-token-storage)
9. [The durable upload queue](#9-the-durable-upload-queue)
10. [The image cache](#10-the-image-cache)
11. [Push notifications, client side](#11-push-notifications-client-side)
12. [Local notifications and background scheduling](#12-local-notifications-and-background-scheduling)
13. [Maps and location](#13-maps-and-location)
14. [BBCode](#14-bbcode)
15. [Camera, photo picking and cropping](#15-camera-photo-picking-and-cropping)
16. [Deep links, the OAuth redirect, and share intents](#16-deep-links-the-oauth-redirect-and-share-intents)
17. [Android project configuration](#17-android-project-configuration)
18. [Configuration and secrets](#18-configuration-and-secrets)
19. [Testing](#19-testing)
20. [Accessibility, responsiveness and performance](#20-accessibility-responsiveness-and-performance)
21. [What this changes elsewhere](#21-what-this-changes-elsewhere)
22. [Decisions taken](#decisions-taken)
23. [Cross-references](#cross-references)

---

## 1. What makes this app's architecture unusual

Five requirements from `AppSpec/` shape almost every decision below, and are worth stating up front
because each one rules out an otherwise-obvious choice:

1. **No data caching, anywhere** (`rules.md`, Caching — images only). Feeds, entries, profiles and
   search results are fetched fresh on every visit. This removes the usual reason to reach for a
   server-cache library, and replaces it with a much smaller need: a four-state
   (loading/loaded/empty/error) fetch primitive.
2. **Images *are* cached, to a specific contract** — 15 minutes, disk-persisted, URL-keyed, app-wide,
   no size cap. That is a bespoke component; nothing off the shelf implements exactly it.
3. **Up to two tokens per account, several accounts, and write-gating keyed on live token
   possession** (`api-appendix/auth.md`; `rules.md`, Authentication & session). Token possession is
   observable application state, not a hidden detail of an HTTP layer, because the UI reads it on
   every write affordance.
4. **The hidden-member list is device-local and never leaves the device** (`rules.md`, Hiding
   members). This is what forces the push-notification design in §11 to be more than "install the
   FCM plugin".
5. **English-only v1, no localisation layer** (`rules.md`, Non-functional requirements). Strings are
   a first-class module, not scattered literals — see §2 and TODO F.

---

## 2. Repository and package layout

### Where the app sits

The app is a **new package in the existing `b-oss` monorepo**, alongside the packages it reuses.
`notification-service.md` already settles that the cloud service lives there too, as a peer package.

Two existing packages also have to move, and they are listed here rather than treated as someone
else's problem: **the app is the forcing function for both**, and §2's layout is incomplete without
them.

```
b-oss/
  packages/
    b-tokens/         NEW — shared design tokens + written style guidance
    b-api/            existing — HTTP client (+ two new seams, §7)
    b-view/           existing — CHANGED: presentational components + view-model types only
    b-view-backup/    NEW — b-view's backup data layer, split out of it
    b-mobile/         NEW — the Capacitor app
    b-push/           NEW — the cloud notification service (Cloudflare Worker)
    …                 b-ark, b-ark-chrome, backup-engine, b-ark-ui-* otherwise unchanged
```

`b-mobile` and `b-push` are npm workspaces like every other package, and inherit the root's
TypeScript, ESLint, Prettier, Vitest, husky and versioning setup unchanged. Nothing about the
monorepo's tooling needs restructuring to accept them.

### The `b-view` backup/live split

`platform-and-reuse.md` requires `b-view` to stop being typed against backup data, and requires
`@b-oss/backup-engine` not to be a dependency of the app. Today the coupling is small but real:
`b-view/src/types.ts` re-exports `BlipEntry`, `BlipComment`, `JournalMetadata` and `EntryIndex`
straight from `@b-oss/backup-engine`, which `b-view/package.json` declares as a runtime dependency,
and the package's hooks read only from a local backup.

**Split it by data source, keeping the name where the consumers already point:**

| Package | Holds | Depends on |
|---|---|---|
| **`b-view`** | `ThumbnailGrid`, `EntryDetail`, `Lightbox`, `DatePicker`, `Pagination`, `InfoPopup`, and **its own view-model types** — source-agnostic, prop-driven | React, `b-tokens` |
| **`b-view-backup`** | the backup data layer (`useJournal`, `useEntry`, `useFolder*`, `useSearchEntries`, the File System Access typings) and the standalone viewer SPA | `b-view`, `backup-engine` |

This keeps `b-view`'s package name pointing at what every consumer actually imports from it —
`b-ark-ui-chrome` and `b-ark-ui-electron` both take `ThumbnailGrid`/`EntryDetail` plus types — so
only `b-ark-ui-electron` (which also uses `useJournal`/`useEntry`) and the two build scripts that
build the SPA need repointing at `b-view-backup`.

**The live adapter — mapping `b-api` responses into `b-view`'s view models — lives in
`b-mobile/src/data/` for now, not in a package.** There is exactly one consumer, and promoting it to
a `b-view-live` package is a single move if a second ever appears. Creating it up front would be
three packages where two are earning their keep.

> This is `b-oss` work rather than app work, and it should land **before** the app starts consuming
> `b-view`, since building against the un-split package would bake in the coupling the split exists
> to remove.

### Shared design tokens: `b-tokens`

`platform-and-reuse.md` raised extracting `tokens.css` into a shared package and deferred it. It
should be done now, because the app is the second real consumer and duplicating the values is how
two products drift apart.

- **`b-tokens` holds the base layer only** — palette, typography, spacing, radii — as `tokens.css`
  plus a TypeScript export of the same values for the places that need them in JS.
- **App-specific tokens stay with their app.** `tokens.css` currently mixes the base palette with
  `--rag-green` / `--rag-amber` / `--rag-red`, which describe backup status and mean nothing to a
  mobile client. Those stay in `b-ark`'s layer; the app adds its own layer for the Ionic
  variable mapping (§5).
- **The written style guidance lives in the same package**, not in a wiki or a comment — the
  colour/spacing/interaction conventions `b-ark` established, which `00-product.md` already names as
  the app's visual starting point. Guidance and values drift apart the moment they live apart.

### The app is one package, not two

The desktop and extension sides of `b-oss` each split into a platform shell and a
platform-free UI kit (`b-ark` / `b-ark-ui-electron`, `b-ark-chrome` / `b-ark-ui-chrome`). **The app
does not split that way, and shouldn't.** That split exists because there are two shells over one
UI; here Capacitor *is* the cross-platform layer, so Android and iOS are one shell, and a
`b-mobile-ui` package would be a boundary with only one thing on each side.

What the split actually buys — testability, and a rule that platform APIs stay in one place — is
kept, as an **internal** boundary instead. See §4.

### Internal structure

```
packages/b-mobile/
  android/                  native project (checked in, see §17)
  ios/                      later; not created for v1
  src/
    app/                    AppShell, providers, route table, menu, error boundary
    screens/                one folder per SCR-NN, named for the spec ID
    flows/                  cross-screen orchestration (FLW-NN) that isn't one screen's job
    components/             app-specific presentational components
    state/                  Zustand stores (§6)
    data/                   client factory, resource hooks, error mapping (§7)
    platform/               THE ONLY PLACE @capacitor/* MAY BE IMPORTED (§4)
    strings/                the copy deck (TODO F output), typed keys
    styles/                 tokens + globals
  capacitor.config.ts
  vite.config.ts
  index.html
  package.json
```

Two naming rules, both worth enforcing because they make the spec and the code navigable from each
other: **screen folders are named for their spec ID** (`screens/SCR-06-entry-detail/`), and **flow
modules likewise** (`flows/FLW-12-compose-publish.ts`). An implementer reading `SCR-19` in the spec
should not have to guess which file implements it, and a reviewer should be able to check coverage
by listing a directory.

### Build tooling

**Vite 8 + React 19 + TypeScript strict**, matching `b-view` exactly — same bundler, same React
major, same `tsconfig.base.json`, same CSS Modules convention. This is not merely tidiness: `b-view`
components are consumed from source (`"main": "src/index.ts"`), so a divergent build setup would
mean compiling them twice under different rules.

- **Styling: CSS Modules + `tokens.css`.** No Tailwind, no CSS-in-JS. `b-view` already establishes
  the pattern and the token values, and mixing systems would defeat the "one visual language" goal
  in `00-product.md`.
- **`npm run typecheck` / `lint` / `test`** at the root pick the package up via the existing
  workspace globs; `typecheck` needs `packages/b-mobile` adding to the root script's project list.
- **Capacitor CLI** (`npx cap sync`, `npx cap run android`) drives the native build; Gradle and
  Android Studio are only needed for signing and release.

---

## 3. Runtime stack

| Concern | Choice | Version (2026-08-03) | Why |
|---|---|---|---|
| Native container | Capacitor | `8.5.0` | Settled in `platform-and-reuse.md`. Sets minSdk 24, compile/target SDK 36 |
| UI framework | React | `19.x` | Matches `b-view` and the monorepo's `overrides` |
| App shell / navigation | Ionic React + `@ionic/react-router` | `8.8.16` | §5 |
| Routing | `react-router` / `react-router-dom` | `5.3.x` | Pinned by Ionic 8 — §5 |
| Client state | Zustand | `5.0.x` | §6 |
| Build | Vite | `8.x` | Matches `b-view` |
| Maps | MapLibre GL JS | `6.1.0` | §13 |
| BBCode | `@bbob/react` | `4.4.1` | §14 |
| Cropping | `react-easy-crop` | `6.2.3` | §15 |
| Secure storage | `@aparajita/capacitor-secure-storage` | `8.0.0` | §8 |
| Native uploads | `@capacitor/file-transfer` | `2.0.4` | §7, §9 |
| Tests | Vitest + Testing Library | root versions | §19 |

**Capacitor plugins** (all `8.x` first-party unless noted): `app`, `browser`, `camera`,
`clipboard`, `device`, `dialog`, `filesystem`, `file-transfer`, `geolocation`, `haptics`,
`keyboard`, `local-notifications`, `network`, `preferences`, `push-notifications`, `share`,
`splash-screen`, `status-bar`, plus `@aparajita/capacitor-secure-storage`.

**`@capacitor/preferences` is for non-sensitive data only** — never tokens. See §8.

---

## 4. The platform boundary

**Rule: `@capacitor/*` and every other native-capability import live in `src/platform/` and nowhere
else.** Screens, flows, state and components import from `src/platform/…`, never from a plugin
directly.

This is the same idea as `BackendContext` in `b-ark-ui-components`, applied inside one package
instead of across two. It buys three things that matter here:

- **Tests run in jsdom** with platform modules mocked, so screen logic is testable without a device
  or a Capacitor runtime (§19).
- **`vite dev` in a desktop browser stays usable** for most of the app, because each platform module
  can carry a web fallback (§19). This is the single biggest lever on iteration speed for a 28-screen
  app.
- **Plugin churn is contained.** Capacitor plugins are the least stable dependency in the stack;
  replacing one should touch one file.

Enforce it with an ESLint `no-restricted-imports` rule scoped to everything outside
`src/platform/**` — the same style of guard the root repo already uses for its "never import
electron / chrome" rules.

One module per capability, each exposing an app-shaped API rather than the plugin's:

| Module | Wraps | Exposes |
|---|---|---|
| `platform/secureStorage.ts` | secure-storage plugin | `getToken`/`setToken`/`deleteToken` keyed by account + purpose |
| `platform/http.ts` | `CapacitorHttp` | a `fetch`-shaped function for `b-api` (§7) |
| `platform/upload.ts` | `@capacitor/file-transfer` | multipart upload from a file path (§7, §9) |
| `platform/imageCache.ts` | `@capacitor/filesystem` + file-transfer | `resolve(url) → displayable src` (§10) |
| `platform/push.ts` | `@capacitor/push-notifications` | permission state, device token, received-push events (§11) |
| `platform/localNotifications.ts` | `@capacitor/local-notifications` | schedule/cancel a reminder, post a local notification (§11, §12) |
| `platform/camera.ts` | `@capacitor/camera` | capture / pick, returning a file path (§15) |
| `platform/geolocation.ts` | `@capacitor/geolocation` | current position, permission state (§13) |
| `platform/browser.ts` | `@capacitor/browser` | open an external URL / an OAuth round (§8, §16) |
| `platform/deepLinks.ts` | `@capacitor/app` | inbound URL and share-intent events (§16) |
| `platform/prefs.ts` | `@capacitor/preferences` | non-sensitive persisted key/value |
| `platform/appState.ts` | `@capacitor/app`, `network`, `device` | foreground/background, connectivity, device facts |

---

## 5. Navigation and routing

### Decision: Ionic React 8, with `react-router` 5 confined to the route table

The app has 28 screens, a swipeable in-screen tab strip, deep links, push targets, a hardware back
button, an anchored account-switcher popover, a bottom-sheet upgrade prompt, and roughly a dozen
confirmation dialogs. Every one of those is a solved problem in Ionic and a fiddly one without it.

**Use `@ionic/react` + `@ionic/react-router` (8.8.16) for the shell: `IonApp`, `IonMenu`,
`IonRouterOutlet`, `IonPage`, `IonHeader`/`IonContent`, `IonModal`, `IonPopover`, `IonActionSheet`,
`IonAlert`.** Use `b-view` components and app components for everything *inside* a page.

Why, concretely — each of these is an `AppSpec/` requirement rather than a nicety:

- **Page stack with native transitions and a working Android hardware back button.** `rules.md`
  (Navigation) requires conventional back behaviour across a graph where entries reach entries
  (prev/next), profiles reach profiles, and pushes open screens cold. `IonRouterOutlet` maintains a
  real stack; a plain `react-router` `<Routes>` maintains none.
- **Anchored popover for the account switcher.** `rules.md` (Multi-account clarity) specifies a
  popover "anchored where it was tapped rather than navigating away". `IonPopover` does exactly
  this, including focus management and dismissal.
- **Sheets and dialogs.** The read-only upgrade prompt, the first-run mode explainer, and the
  confirmation dialogs for hide/unhide/unfollow/refuse/remove/delete/discard are `IonModal`
  (with `breakpoints` for sheet presentation), `IonAlert` and `IonActionSheet`.
- **Accessibility baseline.** `rules.md` requires TalkBack labelling, 48×48dp targets and survival
  at 200% font scale. Ionic's components ship that behaviour; hand-rolled equivalents would each
  need it re-establishing and re-testing.
- **Safe areas, status bar and keyboard avoidance**, which otherwise become 28 separate bugs.

**Costs, stated plainly rather than buried:**

- **Ionic 8 pins `react-router` to 5.x.** Versions 6, 7 and 8 of Ionic have never supported React
  Router 6+; Ionic 9 adds React Router 6 and is
  [tracked for Q3 2026](https://ionic.io/blog/announcing-ionic-framework-8-8) but is not released as
  of 2026-08-03. React 19 itself *is* supported, from
  [Ionic 8.5](https://ionic.io/blog/announcing-ionic-8-5) onward, so there is no conflict with the
  monorepo's React 19 override.
  - **Mitigation, and a hard rule:** `react-router` may be imported **only** in `src/app/routes/`.
    Screens navigate through a thin `useNavigate()`-style wrapper of our own. The Ionic 9 migration
    then touches one directory instead of 28.
  - **Do not wait for Ionic 9.** Starting on a released, stable major and migrating later is lower
    risk than building v1 on an unreleased one.
- **Two style systems in the tree.** Import Ionic's core CSS only, and map `tokens.css` values onto
  Ionic's CSS custom properties (`--ion-color-*`, `--ion-background-color`, …) in one theme file, so
  the shell inherits `b-view`'s palette rather than Ionic's default.

**Alternative considered and rejected:** `react-router` 7 (or TanStack Router) plus a hand-rolled
stack. It avoids the version pin and is the more modern dependency — but it means writing page-stack
semantics, transitions, hardware-back integration, anchored popovers and dialog accessibility by
hand, and getting the deep-link-into-the-middle-of-a-stack case right. That is a large amount of
load-bearing, easy-to-get-subtly-wrong work in exchange for a dependency version.

### Navigation model

`AppSpec/` already fixes the shape: `SCR-02`'s wireframe shows a **side menu** (`=`) plus in-bar
quick actions, and the five feeds are a **tab strip inside the Browse screen**, not five routes.

- **`IonMenu`** holds primary navigation (Browse, Search, Map, My Profile, Notifications, Comments,
  Settings, Help & Info, plus New Entry and Sign In), with its contents varying by sign-in state as
  `01-information-architecture.md` describes.
- **A single `IonRouterOutlet`** holds the page stack. There are no router-level tabs, so no
  `IonTabs`.
- **`SCR-02`'s five feeds are in-screen state**, held by the Browse screen: a header
  `IonSegment` plus a CSS scroll-snap pager for swiping (no extra dependency). Each feed keeps its
  loaded pages and scroll position while the screen is mounted, which is exactly `rules.md`'s
  "switching back to a tab loaded earlier in the same visit doesn't force a re-query" — and, being
  component state, it is correctly *gone* when the screen is freshly entered. `SCR-03` Search works
  the same way for its two tabs.
- **A persistent `AppHeader` component** renders the title bar, the menu button, the quick actions,
  and the `(av)` account indicator (shown only with two or more stored accounts, per `rules.md`).
  Every `IonPage` renders it rather than each screen rebuilding a header.

### Route table

Routes are lowercase and hyphenated. Parameters are always the **string** form of an id (see
`rules.md`, Identifiers).

| Route | Screen | Notes |
|---|---|---|
| `/browse` | `SCR-02` | Launch destination in every case (`rules.md`, App launch) |
| `/search` | `SCR-03` | Two in-screen tabs |
| `/map` | `SCR-04` | `?entry=<id>` for focused mode |
| `/tag/:tag` | `SCR-05` | |
| `/entry/:entryId` | `SCR-06` | The content hub |
| `/entry/:entryId/photo` | `SCR-07` | Full-screen viewer |
| `/entry/:entryId/metadata` | `SCR-08` | |
| `/entry/:entryId/edit` | `SCR-13` | Write-gated |
| `/entry/:entryId/comment` | `SCR-15` | `?replyTo=<commentId>`; write-gated |
| `/entry/:entryId/report` | `SCR-16` | Write-gated |
| `/compose` | `SCR-09` | Write-gated |
| `/compose/details` | `SCR-10` | Holds the in-progress draft |
| `/compose/description` | `SCR-11` | Also reached from `SCR-13` and Settings → Biography |
| `/compose/location` | `SCR-12` | Returns a result to its caller |
| `/uploads` | `SCR-14` | Reads the durable queue (§9) |
| `/me` | `SCR-17` | |
| `/user/:username` | `SCR-18` | |
| `/user/:username/followers`, `/following` | `SCR-19` | |
| `/me/requests` | `SCR-20` | |
| `/me/refused` | `SCR-21` | |
| `/user/:username/awards` | `SCR-22` | `/me/awards` for own |
| `/notifications` | `SCR-23` | Push target |
| `/comments` | `SCR-24` | |
| `/settings`, `/settings/:section` | `SCR-25` | Sections are `general`, `journal`, `profile`, `notifications`, `reminders`, `misc` |
| `/help` | `SCR-29` | Not account-gated |
| `/accounts` | `SCR-30` | Push target for `reauth-required` |
| `/hidden` | `SCR-31` | |
| `/sign-in` | `SCR-01` | Modal presentation; carries the pending action |

**Overlays are not routes.** The account switcher, upgrade prompt, first-run explainer and every
confirmation dialog are Ionic overlays owned by an `OverlayProvider` in `src/app/`, opened
imperatively. `rules.md` is explicit that the switcher "is not a new screen ID"; keeping overlays
out of the router keeps the back stack honest, since dismissing a dialog should not be a navigation.

### Write-gating in the router

`rules.md` requires that a write screen "never opens in the first place" for a read-only account —
the upgrade prompt is shown instead. Implement this **once**, as a route guard on the write-gated
routes above, reading `useCanWrite()` (§6). Screens do not each re-check. This is what makes the
deep-link and share-intent bypass paths impossible to forget, since all three arrive through the
router.

---

## 6. State management

### Decision: Zustand for cross-cutting state; local component state for everything else; no server-cache library

**No server-cache library** (TanStack Query, RTK Query, SWR). Their central value is caching, and
`rules.md` forbids caching displayed data. Configuring one to never cache is fighting the tool for
its remaining features, which are cheaper to write than to suppress.

Instead, `src/data/` provides two primitives that encode the spec's own contract:

- **`useResource(fetcher, deps)`** — returns exactly the four states `rules.md` mandates:
  `loading | loaded | empty | error`, with `empty` distinguished from `loaded` by the fetcher rather
  than guessed at the call site, and a `retry()` for the error state. Every data-loading screen uses
  it, so all 28 loading/empty/error surfaces behave identically and TODO F's copy deck has exactly
  one shape to write against.
- **`usePagedResource(fetcher, deps)`** — adds `loadMore()` and `refresh()` for
  pull-to-refresh + infinite scroll (`rules.md`, Lists, feeds & paging), tracking the API's page
  index/size/`more` triple.

Both **supersede rather than abort** in-flight requests — see §7 on why cancellation can't be done at
the transport layer.

**Zustand 5** holds the cross-cutting state, in small separate stores. The reason to prefer it over
the Context+reducer pattern `b-ark-ui-electron` uses is specific, not fashion: several consumers of
this state are **not React** — the upload-queue runner, the push handler, the deep-link handler and
the reminder scheduler all need to read and write it. Zustand stores are plain modules with
`getState()`/`setState()` outside React and a hook inside it; a Context reducer is only reachable
from the tree.

| Store | Holds | Persisted to |
|---|---|---|
| `accountsStore` | stored accounts (id, username, avatar), the active account id, per-account **token possession** flags, notification-registration id and status, needs-reauth reasons | `prefs` (identity + flags only — **never tokens**) |
| `hiddenMembersStore` | per-account device-local hidden list (`rules.md`, `SCR-31`) | `prefs` |
| `uploadQueueStore` | the durable queue (§9) | `prefs` + files in app storage |
| `devicePrefsStore` | link-handling toggle (`SCR-29`), first-run-explainer seen, per-account reminder settings, confirm-before-star toggle, polling interval | `prefs` |
| `overlayStore` | which overlay is open, and its subject | not persisted |

### Token possession is state, not a storage detail

`rules.md` is emphatic that write-gating asks *"does this account currently hold a valid write
token?"*, not *"what mode was it signed in as?"*. So:

- `accountsStore` carries `hasAppToken` and `hasServiceToken` **booleans per account**. The tokens
  themselves stay in secure storage and are read on demand at request time (§8) — they are never
  copied into the store, never into React state, and never into `prefs`.
- A single derived selector, **`useCanWrite()`**, is the only thing any UI or route guard consults.
  It returns true when the active account holds an app token whose granted scope is `read,write`.
- A forced logout (§7's error mapping) clears the token *and* flips the flag in the same
  transaction, so the UI narrows to read-only immediately and everywhere, which is precisely the
  behaviour `rules.md` describes for an account that loses only its write token.

### Draft state

The compose draft (`SCR-10`) survives navigation to `SCR-11`/`SCR-12` and rotation, and is the
subject of the discard-confirmation guard. Hold it in a **`composeDraftStore`** scoped to the
compose flow rather than in `SCR-10`'s component state, since `SCR-11` and `SCR-12` return values
into it and `rules.md` (Screen sizes & orientation) requires it to survive rotation and window
resizing. It is cleared when the draft is enqueued for upload or explicitly discarded.

---

## 7. Networking and the `b-api` seams

### Two seams, not one

`platform-and-reuse.md` identifies one required change to `b-api` — an injectable
`fetch`-shaped transport. **A second is needed**, and it is the more important of the two:

1. **Transport seam.** `BlipfotoClient`'s constructor takes an optional `fetchImpl`, defaulting to
   `globalThis.fetch`. `request()` and `mutate()` route through it. This is what
   `platform-and-reuse.md` already specifies.
2. **Multipart seam (new).** `mutateMultipart()` builds a `FormData` containing a `Blob`. Native
   HTTP bridges handle that badly:
   [CapacitorHttp intercepts `fetch`/`XMLHttpRequest` and mishandles `FormData`](https://github.com/ionic-team/capacitor/issues/7538),
   with a long tail of related reports. Rather than fight it, `BlipfotoClient` should accept an
   optional **`multipartImpl`** — given the target URL, the plain fields, and a *file reference*
   rather than a `Blob`, it performs the upload and returns the parsed envelope. Web callers keep
   today's `FormData` behaviour as the default; Capacitor supplies a native implementation.

### The Capacitor implementations

**`platform/http.ts`** wraps `CapacitorHttp.request()` in a `fetch`-shaped function. This is required
regardless of preference: Blipfoto serves no CORS headers, so a WebView `fetch()` to
`api.blipfoto.com` is blocked on device.

**`platform/upload.ts`** uses **`@capacitor/file-transfer`** (`2.0.4`) — the first-party Ionic plugin
whose `uploadFile()` uploads natively from a **file path**, with custom headers, an HTTP method
(`PUT` as well as `POST` — both are needed) and progress events. The photo never becomes a `Blob` in
the WebView, which is what removes the `FormData` problem.

**But it does not do multipart with extra fields, and this app needs that.** The three affected
calls each send a substantial set of ordinary fields alongside the one file:

| Call | File field | Other fields |
|---|---|---|
| Publish entry (`POST entry`) | `image` | ~19 — date, title, description, tags, lat/lon, crop, EXIF… |
| Edit entry (`PUT entry`) | `image` (optional) | ~15 |
| Avatar / settings (`PUT user/settings`) | `avatar` (optional) | ~10 |

`uploadFile()`'s options are `url`, `path`, `blob`, `chunkedMode`, `mimeType`, `fileKey`,
`progress`, `method`, `params` and `headers`. **There is no option for additional multipart fields** —
`params` is documented as *"URL parameters to append to the request"*, i.e. the query string, not the
body. Left as-is it can send exactly one part.

**Passing the fields as query-string parameters is not an option.** It would have been the cheap
answer — `params` appends to the URL and the file goes in the body — but **the API does not read
entry fields from the query string on a multipart `POST`/`PUT`; they must be in the body.**
Confirmed, not assumed: it needs no spike time, and an implementer who rediscovers `params` should
find this line rather than repeat the experiment.

**So the multipart body is assembled by the app.** Write a complete `multipart/form-data` body — all
fields, then the file bytes — to a temp file, then call `uploadFile()` with an **explicit**
`Content-Type: multipart/form-data; boundary=…` header.

**Confirmed by reading the plugin's native source (`ionfiletransfer-android` 1.0.3,
`ion-ios-filetransfer`), not inferred from an unconfirmed issue report.** On Android,
`IONFLTRConnectionHelper.useMultipartFormData()` treats a caller-supplied `Content-Type` as an
opt-out of the plugin's own multipart handling, and `IONFLTRController.handleDirectUpload` then
streams the file at `path` onto the connection byte-for-byte. On iOS,
`IONFLTRURLRequestHelper.configureRequestForUpload` makes the identical check, and when it's true
the upload task reads the file at `path` unmodified. Both platforms pass a hand-built body straight
through with no rewriting. This closes the question TODO H was written to answer, in the same
direction its preference order already pointed — hand-build the body, executed through
`file-transfer` rather than `CapacitorHttp`, with the "recent Capacitor HTTP handles it natively"
hope closed off and the CORS-proxy fallback no longer needed. It just closes it by reading the two
files that implement the behaviour, at the pinned version, rather than by running a device test:
there's nothing left to prove, only ordinary implementation.

**A trap for later, on the route this document already rejects for a different reason.** Skip the
explicit `Content-Type` and pass fields via `uploadFile()`'s `params` option instead, and
**Android** will build a correct multipart body from them on its own
(`IONFLTRController.createMultipartData` merges `options.formParams` and `httpOptions.params` into
the body) — but **iOS never does**: `IONFLTRURLRequestHelper.createMultipartBody` only reads
`uploadOptions.formParams`, which the Capacitor iOS plugin never populates from `params`. Fields
would silently vanish from the body on iOS while looking correct in Android testing. `params` was
already ruled out above because the API needs fields in the body, not the query string; this is a
second, independent reason not to backtrack toward it once b-oss adds iOS.

`platform/upload.ts` hides all of this behind `b-api`'s multipart seam, so nothing above it knows.

> **TODO H's multipart question is closed, not spiked.** The original task was to test three
> candidate transports on-device and record which survived. Reading the plugin's actual source
> settled it without needing a device at all. What remains is ordinary build-then-test: write
> `platform/upload.ts` before the rest of compose depends on it, and let its first real publish
> against Blipfoto's API be that module's own test — not a dedicated pre-build gate.

**One progress caveat.** `uploadFile()`'s progress events have been reported to give
`contentLength: -1`, which breaks percentage calculation. It doesn't matter here: the queue writes
the upload file itself (§9) and therefore already knows its size, so `SCR-14`'s progress bar should
compute from `bytes / knownTotal` rather than trusting the event's total.

### Request cancellation

**`CapacitorHttp` cannot abort a request.** `AbortSignal` is honoured only in the web
implementation; [native abort support is an open feature request](https://github.com/ionic-team/capacitor/issues/5978).
`SCR-04` says to "cancel any in-flight fetch" when the map region changes, and `SCR-03`'s debounced
search implies the same.

**Cancellation is therefore implemented at the application layer, not the transport layer:** each
resource hook holds a monotonically increasing request id and discards the response of any request
that is no longer the newest. The user-visible behaviour is identical; the difference is that the
superseded request still completes on the wire and still costs a rate-limit slot. That makes
`SCR-04`'s existing instruction to **debounce** region fetches load-bearing rather than merely
polite — it is now the only thing actually reducing request volume, so debounce generously
(~400–500ms after the gesture settles) and skip fetches whose new bounds are contained by the
previous ones.

### The client factory

`src/data/client.ts` exposes `getClient(purpose)` rather than a singleton, because the correct
bearer changes with the active account and, for the notification service's read token, with the
purpose. It:

- reads the right token from secure storage (§8), falling back to the **app's registered client id**
  when there is no active account, per `auth.md`'s anonymous rule — and never issues a
  credential-less request;
- injects `platform/http.ts` and `platform/upload.ts`;
- surfaces `rateLimitInfo` from the response headers `b-api` already parses;
- funnels every `BlipfotoError` through the error mapper below.

### Error mapping, in one place

`src/data/errors.ts` exposes a single `mapApiError(error, context)` that every call site uses. It
turns a `b-api` `BlipfotoError` code into one of a small set of outcomes:

| Outcome | Trigger | Effect |
|---|---|---|
| `forced-logout` | invalid-session codes | Clear **that token only**, flip its possession flag, run `FLW-02`'s per-token handling |
| `upgrade-prompt` | insufficient-scope (error 16) | Should be unreachable; surface a plain visible message, since reaching it means the gate has a bug (`rules.md`) |
| `rate-limited` | rate-limit codes | Back off; show the rate-limit message |
| `validation` | write/validation codes | Return a copy-deck key to the calling screen, which keeps the user's input (`rules.md`, Surface errors without losing work) |
| `transport` | `NetworkError` | Retriable — the only class the upload queue retries (§9) |
| `message` | everything else | Show the mapped string |

The code→outcome table is **TODO G's output**, and the copy-deck keys it returns are **TODO F's**.
Until those land, implement the mapper with the codes `api-appendix/error-codes.md` already defines
and a clearly-marked default branch, so the gaps are visible rather than silently swallowed.

---

## 8. Authentication and secure token storage

### The OAuth round

`auth.md` specifies implicit grant with a custom-scheme redirect. Implementation:

1. `b-api`'s existing `buildImplicitGrantUrl()` builds the URL, with `scope` passed as the
   union type `'read' | 'read,write'` — which is already how `b-api` types it, and is exactly the
   "make the two values the only representable options" that `auth.md` asks for. **No code path may
   construct the scope string from configuration or user input.**
2. A fresh `state` is generated per round via `crypto.getRandomValues()` and held in memory (not
   persisted — a round that doesn't complete before the app dies should fail closed).
3. **`platform/browser.ts` opens the URL with `@capacitor/browser`**, which uses Android Custom Tabs
   / iOS `SFSafariViewController` — *not* an in-app WebView. This is both the OAuth best practice
   for native apps and the practical choice: the user's existing Blipfoto session and password
   manager work.
4. The redirect to `bmobile://oauth/` is caught by `platform/deepLinks.ts`
   (`App.addListener('appUrlOpen')`), the browser is closed, and `b-api`'s
   `parseImplicitGrantCallback()` extracts the token, `state` and any username. It already handles
   the token arriving in either the fragment or the query.
5. **`state` is verified before the token is trusted or stored.** A mismatch is discarded silently,
   per `auth.md` — not surfaced as a sign-in error.
6. `GET oauth/token` confirms the token was issued to this app and reads back its granted scope.
   **The granted scope, not the requested one, is what sets `hasAppToken`'s read/write value.**
7. The two-token mode (`read,write` + notifications) runs steps 1–6 **twice, visibly**, as two
   distinct named actions, per `auth.md`. Two rounds means two distinct `state` values.

> **The fragment (`#access_token=…`) surviving a custom-scheme redirect into an Android intent is
> standard, production-proven behaviour, not a novel unknown** — the identical pattern is shipped by
> Spotify's Android SDK and by `capacitor-community/generic-oauth2`, which lists implicit ("token")
> grant as tested/working on Android. What's actually unverified is narrower: whether
> `@capacitor/app`'s `appUrlOpen` fires reliably for *this app's* manifest/intent-filter wiring — a
> config-correctness check made during normal development of the deep-link handler (§16), not a
> dedicated spike. See [Decisions](#closed) (Q3.2).

### Secure storage

**`@aparajita/capacitor-secure-storage` (8.0.0)** — Android Keystore / iOS Keychain, actively
tracking Capacitor 8, TypeScript API. `capacitor-secure-storage-plugin` is the better-known
alternative but is markedly less current.

- **Key scheme:** `token:<accountId>:app` and `token:<accountId>:service`. One entry per
  (account, purpose), matching `auth.md`'s "each attached to the account and purpose it was obtained
  for".
- **`platform/secureStorage.ts` is the only module that touches it.** Tokens are read at request
  time and not retained: no token ever reaches a Zustand store, React state, `@capacitor/preferences`,
  `localStorage`, a log line, or an error message.
- **iOS (later):** set accessibility to *when-unlocked, this-device-only* so tokens never sync to
  iCloud Keychain.

### Backup exclusion

`auth.md` and `rules.md` both require tokens to be excluded from OS-level device backup. The
simplest correct answer is also the one that matches the rest of the spec:

**Set `android:allowBackup="false"` in the manifest.** The app has essentially nothing worth backing
up — no cached data (§1), an image cache that is by definition disposable, and a hidden-member list
that `rules.md` already says "does not travel to another device or survive reinstalling the app".
Turning backup off wholesale satisfies the token requirement in one line and introduces no
behavioural surprise.

*(If device backup is ever wanted for the non-sensitive parts, the alternative is
`android:dataExtractionRules` plus `android:fullBackupContent` excluding the secure-storage
preferences file. Note that even without exclusion a restored token would be undecryptable, since
Keystore keys are non-exportable — but that yields a confusing decryption error rather than a clean
"signed out", which is why explicit exclusion is preferred either way. Any implementation must treat
a failed token read as "no token held" and route to re-authorization, never as a crash.)*

### Revocation

`DELETE oauth/token` is authenticated with **the specific token being revoked**, not the active
one (`api-appendix/endpoints.md`). `getClient()` must therefore accept an explicit token for this
call, and `FLW-22`'s mode changes must revoke each surplus token individually.

---

## 9. The durable upload queue

`rules.md` requires uploads to continue after leaving the compose screen, to queue, to show
progress, to retry network failures with capped backoff, and to stop on an application error.
`SCR-14` requires the list to be correct after navigating away and back.

### Design

- **On enqueue, the photo is copied into app-private storage** (`Directory.Data`) and the queue item
  references that path. This is not optional: a photo-picker URI is a temporary grant that can
  expire or be revoked before the upload runs.
- **A queue item** is `{ id, accountId, kind: 'publish' | 'edit', filePath, fields, status, attempts,
  nextAttemptAt, error }`, persisted in `prefs` and mirrored in `uploadQueueStore`. Statuses are
  `waiting | uploading | uploaded | failed`, matching `SCR-14`'s four displayed states exactly.
- **One runner, one item at a time.** A module in `src/flows/` (not a React component) drains the
  queue. Serial rather than parallel: it keeps progress reporting honest and avoids several large
  uploads competing on a phone connection.
- **The upload itself is `platform/upload.ts`** — a native multipart `POST`/`PUT` via
  `@capacitor/file-transfer` (§7), with its progress events feeding `uploadQueueStore`. Because the
  queue writes the upload file, it knows the byte total and reports progress against that rather
  than against the event's own (unreliable) total.
- **Retry policy:** only `transport` outcomes retry, with capped exponential backoff (e.g. 5s, 15s,
  45s, 2m, 5m, capped at 5m, giving up after ~6 attempts and moving to `failed`). Every other
  outcome from `mapApiError` moves straight to `failed` with its message — `rules.md`'s "an
  application error stops that upload and surfaces a message; it is not retried blindly".
- **Account removal cancels that account's items** (`rules.md`: in-flight work using a removed
  account's token is cancelled, not left running).
- **On success**, the item goes to `uploaded`, its copied file is deleted, and — see §12 — that
  account's reminder for today is cancelled.

### The honest limitation

**A Capacitor app cannot upload while its process is dead.** A native `file-transfer` upload
continues while the app is merely backgrounded, which covers the common case (the user leaves
compose, locks the phone, comes back). If Android kills the process mid-upload, the item is found in
`uploading` on next launch, reset to `waiting`, and resumed.

This satisfies "durable" as `rules.md` uses it — the queue survives leaving the screen and is
correct on return — but it is not a background-transfer service, and it should not be described to
users as one. Two mitigations are worth taking: post an **ongoing local notification while an upload
is active** (which also gives `SCR-14`'s "persistent indicator" for free, and makes the app less
attractive to kill), and reset stale `uploading` items on launch. Whether to go further and add a
foreground-service plugin was considered and [declined for v1](#closed) (Q4).

---

## 10. The image cache

The contract from `rules.md` is precise: **15 minutes, keyed by URL, app-wide, persisted to disk so
it survives a restart, bounded by the TTL alone, no metered-connection exception, and explicitly not
an offline mode.**

Nothing off the shelf implements that, and the WebView's own HTTP cache can't be made to — its
behaviour depends on whatever cache headers the image host sends.

### Design

**`platform/imageCache.ts` + a `<CachedImage>` component.**

- **Key:** a hash (SHA-256, truncated) of the full image URL → a filename in `Directory.Cache`.
- **Fetch:** `@capacitor/file-transfer`'s `downloadFile()` — native, so it neither hits CORS nor
  competes with the WebView's own loading.
- **TTL:** file mtime + 15 minutes. `resolve(url)` returns the cached path when fresh, otherwise
  downloads and replaces. A sweep on app launch (and on resume after a long background) deletes
  expired files.
- **Display:** `Capacitor.convertFileSrc(path)` yields a WebView-loadable `src`. `<CachedImage>`
  renders a placeholder while resolving and falls back to the remote URL if the cache layer fails —
  a cache miss must never become a broken image.
- **No size cap**, per spec. `Directory.Cache` is OS-evictable, which is the correct behaviour for a
  cache and means "no cap" cannot become a disk-space problem.
- **On the web fallback** (`vite dev` in a browser), `resolve()` returns the URL unchanged.

The URL-keyed design also gives `rules.md`'s invalidation story for free: a replaced photo has a new
URL and simply stops being referenced, and the 15-minute TTL bounds the in-place-overwrite case.

---

## 11. Push notifications, client side

`@capacitor/push-notifications` (`8.1.2`) over FCM, with `google-services.json` in the Android
project. The straightforward parts:

- **Permission.** `checkPermissions()` / `requestPermissions()` return `prompt`, `prompt-with-rationale`,
  `granted` or `denied` — which maps **exactly** onto `rules.md`'s required distinction between
  *"not asked yet"* (request it) and *"asked and refused"* (don't request into silence; explain and
  offer to open system settings). Read the current state every time; never remember a past answer.
  Check it **before** starting the read-token authorization round, per `rules.md`.
- **Device token.** `register()` then the `registration` listener. **The same listener fires on
  token rotation**, and its handler must call the service's `PATCH /v1/registrations/:id` — the
  requirement `FLW-16` and `notification-service.md` both state.
- **Tap routing.** `pushNotificationActionPerformed` carries the payload; route to the entry,
  profile, pending-requests or accounts screen per `FLW-16`, through the same deep-link resolver as
  §16 so cold-start and warm-start behave identically.
- **Launch backstop.** On every launch, for each account with notifications nominally on: read the
  live permission state and call `GET /v1/registrations/:id`. Either failing is handled as
  `FLW-16` step 8 specifies.

### Pushes are contentless, and why

**The service can only tell the app that a count went up.** This is settled in
`notification-service.md` and repeated here because it shapes the client: every Blipfoto endpoint
that returns notification or comment *content* also marks it read, so a polling service that read
content would silently clear the user's badges in this app, on blipfoto.com, and everywhere else,
every cycle. Only the counts endpoint is side-effect-free.

So a push carries **which stream moved and by how much** — nothing else. No type, no target, no
actor.

- **Pushes stay ordinary FCM notification messages.** No data-only delivery and no custom native
  `FirebaseMessagingService`, which matters for reliability: Android defers data-only messages in
  Doze and drops them entirely for a force-stopped app.
- **Tapping opens the corresponding inbox** — `SCR-23` or `SCR-24` — which fetches the items and,
  in doing so, clears the badge. That is the one moment at which clearing is correct.
- **Hidden-member suppression on push is not possible**, for any activity type, because there is no
  actor in the payload. `FLW-16` records this as an accepted limitation. Nothing leaks: a push that
  names nobody cannot reveal a hidden member's identity, and both inboxes filter the content they
  fetch. The cost is a notification the user didn't need.
- **The hidden list therefore never leaves the device**, and `rules.md`'s promise about hiding
  stands unqualified.

> An earlier draft of this section proposed uploading salted digests of the hidden list so the
> service could filter, under an opt-in. That is moot: the service never obtains an actor to
> compare against, so there is nothing to filter. Recorded because the reasoning may look worth
> revisiting, and it isn't.

### Filtering and routing in the inboxes

The app *does* fetch content for `SCR-23` and `SCR-24`, so this is where hiding and routing are
actually implemented. The two streams are very differently shaped, and the asymmetry is
load-bearing.

**`SCR-24` comments — fully structured, everything works.** Each row carries the commenter as a
structured object (with `username`), an `unread` flag, a comment/reply type discriminator, and the
entry id. Hidden-member filtering and routing are both exact.

- **One trap:** the first fetch clears **all** the user's unread comment rows, not just the page
  returned. So `unread` must be **snapshotted from the first response** — on any subsequent page,
  every row will already read as read.

**`SCR-23` notifications — a rendered blob.** A row carries only an id, server-rendered text
(BBCode plus its HTML rendering), an image URL, a link URL, and a has-more-content flag. **No
actor, no type, no unread flag, no timestamp.** Consequences:

- **Hidden-member suppression is best-effort, not guaranteed.** The actor's username appears in the
  rendered `content_html` as an anchor, so the app parses the hrefs, keeps those matching
  `blipfoto.com/<single-segment>` excluding reserved prefixes (`entry`, `me`, `store`, `_assets`),
  treats them as candidate actors, and suppresses the row if any is hidden. ~20 lines, and it works
  in the ordinary case.
  - **Stated plainly because it is a safety feature:** this is a heuristic over server-rendered,
    localised text. If the wording or link structure changes server-side it degrades silently, and
    nothing in the app would detect that. It was preferred over doing nothing because the leak it
    prevents is real and the alternative — hiding working on every surface except one inbox — is a
    worse inconsistency. See `rules.md` and `SCR-23`.
- **Route from `link_url`.** `/entry/{id}` and `/{username}` are reliable and distinct.
- **Follow-requests are the exception**, and must be special-cased: `link_url` points at the
  requester's profile, not the requests screen. The fixed internal path `me/followers/requests`
  appears as a link inside `content_html` instead, so detect *that* and route to `SCR-20`. It is a
  hardcoded server-side path, which makes it a far more robust signal than username parsing.
- **Unrecognised targets open the web URL in the system browser** via `@capacitor/browser`, rather
  than no-op. A tapped notification that does nothing reads as broken. Awards and bulk-communication
  links are opaque server-supplied URLs, so this is their path.
- **No timestamps in either stream**, so neither inbox can show relative times; ordering is by
  descending opaque id.
- **Blipfoto's own bulk/promotional messages arrive in the same stream with no discriminator.** They
  render like any other notification. There is no reliable signal to filter or restyle them, and
  attempting it on heuristics would be worse than accepting it.
- **Both streams retain ~14 days**, so neither inbox pages back further.

**Hiding is keyed by username**, because that is the only identifier the comment payload and the
notification links expose — no numeric user id is available. Usernames are editable (`SCR-25`), so
a hidden member who renames themselves escapes the hide until re-hidden. A platform limitation, not
a design choice.

**Do not call `PUT messages/notifications/unread`.** Fetching the notifications list already marks
exactly the returned rows read, so the explicit call is redundant.

## 12. Local notifications and background scheduling

`@capacitor/local-notifications` (`8.2.1`) serves two jobs: `FLW-18`'s daily reminder, and (per §11)
posting notifications the app builds itself.

### `FLW-18` — daily reminder

- **One scheduled notification per read-write account**, with a stable id derived from the account,
  scheduled `on: { hour, minute }` with `repeats: true`. Cancelled when the account is removed or
  changes to read-only, per `FLW-18`.
- **Inexact scheduling. Do not request exact-alarm permission.** From Android 14,
  `SCHEDULE_EXACT_ALARM` is [not pre-granted](https://capacitorjs.com/docs/apis/local-notifications),
  and `USE_EXACT_ALARM` is reserved for apps where exact timing is the core function — alarm clocks
  and calendars. A "post your blip" nudge is not that, and a Play review would be right to say so. A
  reminder arriving within a few minutes of the chosen time is entirely adequate; the doc should say
  so rather than leave an implementer to discover the policy the hard way.
- **Suppression is implemented by cancellation, not by a check at fire time.** `FLW-18` requires the
  reminder to be suppressed if the account has already published through the app that day, and is
  explicit that no network call may happen at fire time. A scheduled local notification cannot run
  app code before firing at all — so instead: **when an upload for account A completes successfully,
  cancel A's reminder occurrence for today and schedule the next one for tomorrow.** Same observable
  behaviour, no fire-time logic, and it works with no connectivity.
- **`POST_NOTIFICATIONS` is shared with push.** On Android 13+, reminders need the same runtime
  permission as pushes. Request it when reminders are first enabled, using the same
  not-asked/refused distinction as §11. Note that `rules.md`'s "no remembered blocked state" rule is
  written about push; the same treatment should apply to reminders — a refusal turns the reminder
  setting off rather than creating a third state. Confirmed — see [Decisions](#closed) (Q6).

### Nothing else runs in the background

There is no background sync, no periodic work manager, and no background fetch. The app polls
nothing — that is the notification service's entire reason to exist.

---

## 13. Maps and location

Two screens need maps: `SCR-04` (browse geotagged entries by viewport) and `SCR-12` (place a single
marker).

### Decision: MapLibre GL JS in the WebView

**MapLibre GL JS `6.1.0`**, rendered in the WebView, rather than a native maps plugin.

- **No billing account, no Google Maps Platform dependency.** Google Maps Platform's pricing has
  moved to tiered plans with a much smaller free allowance than the old universal credit; for a free
  personal project, requiring a card on file to render two screens is the wrong trade.
- **It runs in `vite dev` in a desktop browser**, so both map screens stay iterable without a device
  — a large practical benefit given §4's whole approach.
- **One implementation for Android and iOS**, with no native-plugin behaviour to reconcile.
- **It avoids the native-map-under-a-transparent-WebView pattern** that `@capacitor/google-maps`
  uses, which is awkward wherever map and DOM content overlap — and `SCR-04`'s marker info window
  and `SCR-12`'s toolbar both overlap.

**Tile provider is a separate decision from the renderer**, and should stay that way: put it behind
`src/platform/mapTiles.ts` returning a style URL, so the provider can be swapped without touching
either screen. The recommendation is **MapTiler's free tier** (attribution required,
non-commercial — which fits a GPLv3 personal project), with the key in build configuration (§18).
Stadia Maps and a self-hosted Protomaps basemap are the credible alternatives. See
[Decisions](#closed) (Q7).

**Location** uses `@capacitor/geolocation` for the my-location control on `SCR-04`/`SCR-12` and for
`SCR-02`'s Nearby feed, requesting permission at the point of use, never on screen entry.

**Marker volume** on `SCR-04` is bounded by what `entries/search` returns per bounding-box query, so
no clustering is specified for v1. If a dense region ever produces enough markers to matter,
MapLibre's built-in GeoJSON clustering covers it without a new dependency.

---

## 14. BBCode

`SCR-06` and `SCR-18` render BBCode with working links; `SCR-11` and `SCR-15` edit it.

- **Rendering: `@bbob/react` (`4.4.1`)** — parses BBCode to React elements rather than to an HTML
  string, so there is **no `dangerouslySetInnerHTML` anywhere in the app**. Given the content is
  written by other members, that is the security-relevant property, not a stylistic one.
- **The supported tag set is exactly five**, and the preset should allow-list precisely these and
  nothing else:

  | Tag | Syntax | Renders as |
  |---|---|---|
  | Bold | `[b]…[/b]` | `<b>` |
  | Italic | `[i]…[/i]` | `<i>` |
  | Underline | `[u]…[/u]` | `<u>` |
  | Strikethrough | `[s]…[/s]` | `<s>` |
  | Link | `[url=…]Label[/url]` or bare `[url]…[/url]` | `<a href>` |

- **Unknown tags render as their literal text** rather than being dropped, so nothing silently
  disappears from someone's description.
- **`[url]` has behaviour beyond wrapping**, and the app must match it or links will render
  differently here than on the website: a URL with no scheme gets `http://` prepended, an
  email-looking target becomes `mailto:`, and the label is optional (a bare `[url]` uses the target
  as its own label).
- **Link *creation* is gated per account server-side, and the app cannot know it.** Accounts that
  haven't cleared the platform's anti-spam threshold have their links ignored on save. **The API
  exposes no capability flag for this**, so there is no way for the app to detect it — checked, not
  assumed.
  - **So the link button is always shown, and the app does nothing special.** This is a deliberate
    exception to the usual hide-don't-disable rule (`rules.md`), made because the alternative is
    inventing a detection mechanism that doesn't exist. For a new or unverified account the markup
    is simply not honoured; nothing errors, nothing is lost, and the condition clears itself as the
    account ages.
  - Worth stating so an implementer doesn't go looking: this is an API limitation, and the correct
    response is to leave it alone rather than build around it.
- **Link targets open per destination, not per `target` attribute.** The website marks off-site
  links `target="_blank"`, which is meaningless in an app. Instead: a `blipfoto.com` link that maps
  to a screen opens in-app through the deep-link resolver (§16); everything else opens in the system
  browser via `@capacitor/browser`. Never navigate the WebView itself away from the app.
- **Editing is plain text plus a toolbar**, per `SCR-11` — not a WYSIWYG surface. The toolbar wraps
  the current selection or inserts at the caret, operating on the raw string in a `<textarea>`.
  BBCode remains the storage format, as `SCR-11` decides. Five tags means five buttons, one of them
  conditional.

---

## 15. Camera, photo picking and cropping

- **`@capacitor/camera`** covers both of `SCR-09`'s paths. Use `CameraSource.Camera` for capture and
  `CameraSource.Photos` for the picker, returning a **file URI** (`resultType: Uri`) rather than
  base64 — a full-resolution photo as a base64 string is a reliable way to exhaust WebView memory,
  and §9 wants a path anyway.
- **Permissions match `SCR-09` exactly**: the camera permission is requested only when *Take a
  photo* is tapped, and a refusal leaves *Choose from device* fully usable. The system picker needs
  no permission and no broad storage access, which is what `SCR-09` asks for.
- **Cropping: `react-easy-crop` (`6.2.3`) in the WebView**, not `@capacitor/camera`'s `allowEditing`.
  `allowEditing` delegates to whatever crop activity the device happens to have, which varies by OEM
  and is absent on some devices — unacceptable for a feature `SCR-10` gates on membership and
  `SCR-25` uses for avatars. A JS cropper is consistent everywhere.

**The two crops are not the same operation, and conflating them would be a real bug.**

| | `SCR-10` entry thumbnail | `SCR-25` avatar |
|---|---|---|
| What is sent | **Coordinates** — `thumbnail_crop` as `x,y,w` floats in 0.0–1.0 of the image's dimensions (one width, because it's square) | **A cropped JPEG** — the `avatar` field takes an image, and there is no crop-coordinate parameter |
| The uploaded image | The **full, uncropped** photo | The cropped result |
| Client-side pixels | None — the crop is metadata | Canvas crop and re-encode |

So for an entry, `react-easy-crop` is a **coordinate picker with a live preview**: it shows the
default crop, the user adjusts it, and the app sends the resulting `x,y,w` triple alongside the
untouched photo. Nothing is re-encoded, and the server keeps the original — which is what lets the
crop be changed later without quality loss. For the avatar there is no such field, so the crop has
to be applied client-side and the cropped JPEG uploaded.

- **Downscaling is separate from either crop.** `SCR-10` says to respect the "upload full size"
  preference (`SCR-25` Misc), so a canvas resize may still happen on the entry path — but that is a
  resolution decision, not a crop, and it must not alter the `thumbnail_crop` values, which are
  proportional and therefore survive a resize unchanged.
- **Validation** (`SCR-10`: unsupported type, too small) happens on the picked file before the
  compose screen accepts it, so the failure surfaces at the point of choosing rather than at
  publish. The exact limits come from TODO G.

---

## 16. Deep links, the OAuth redirect, and share intents

Three inbound paths, all arriving through `@capacitor/app`'s `appUrlOpen` and Android intents, and
all resolved by **one** module, `src/flows/deepLinkResolver.ts`, so cold start and warm start cannot
diverge:

| Input | Scheme / intent | Handling |
|---|---|---|
| OAuth redirect | `bmobile://oauth/` | Consumed by the in-progress auth round (§8); never routed |
| Entry / profile link | `bmobile://entry/:id`, `bmobile://user/:username` | Resolve to a route; gate via `FLW-01` if the target needs an account |
| Blipfoto web link | `https://www.blipfoto.com/…` | **Opt-in only** — see below |
| Share-to-Blipfoto | `ACTION_SEND` with an image | Enter compose at `SCR-10` with the photo pre-loaded, through the same write gate as `SCR-09` (`rules.md`, `FLW-12`) |

### Why not `blipfoto://`

**There is no technical reason to use the brand in the scheme, and three reasons not to.** A custom
scheme is private between the app and whatever wants to link into it; it maps to nothing on the
website, and the real site URLs are handled separately by the opt-in `https` path below. So the
choice is free — which makes the arguments against `blipfoto://` decisive:

- **Custom schemes are first-come-first-served with no ownership check.** Whichever app the OS
  resolves first wins, and there is no arbitration. `blipfoto://` invites a collision with the old
  app if it is ever installed alongside, and with any other third-party client.
- **This is an unofficial app**, and baking a brand it doesn't own into its URL namespace is a claim
  it shouldn't make.
- **It would be awkward to change later**, because the OAuth redirect URI is registered with
  Blipfoto and only one may exist per registration.

**Use `bmobile://` for both**, distinguished by path: `bmobile://oauth/` for the redirect,
`bmobile://entry/…` and `bmobile://user/…` for content. Two schemes buy nothing — both are equally
squattable, and `state` verification (§8) is what actually defends the redirect, not scheme
separation. One scheme with two path namespaces is simpler and removes a class of
which-scheme-was-that confusion.

**Trailing slash on the redirect is required, not stylistic.** Blipfoto's registration form
rejects `bmobile://oauth` without one (a bare path segment with no trailing `/`, unless suffixed
with a wildcard `*`). The redirect URI comparison at the OAuth server is exact-string, so every
place that builds or checks this value — the authorize-URL builder, the deep-link resolver's
match, `VITE_OAUTH_REDIRECT_URI` — must use `bmobile://oauth/` consistently, including the slash.

*Unhyphenated deliberately.* `b-mobile://` is legal per RFC 3986, which permits hyphens after the
first character, but scheme validators are a common place to meet an over-strict regex — including,
potentially, Blipfoto's own redirect-URI check at registration. There is nothing to gain by finding
out.

> **This supersedes the root task list**, which currently specifies `blipfoto-app://oauth` and
> requires it be kept distinct from a `blipfoto://` content scheme. That guidance was about avoiding
> brand reuse *for the redirect*; the reasoning applies equally to the content scheme. **Settle this
> before registering the app with Blipfoto** — the registration takes one redirect URI, and it is
> editable but only at the cost of doing the job twice.

**Opt-in web-link handling** (`rules.md`, `SCR-29`) needs a mechanism, since an intent filter in the
manifest is static. The workable approach on Android: declare the `https` intent filter on an
**`<activity-alias>`** that is **disabled by default**, and toggle it at runtime with
`PackageManager.setComponentEnabledSetting()` from a small custom plugin. Two properties make this
the right shape: with the alias disabled the app does not appear in the chooser at all, and because
the filter is **not** `autoVerify` (App Links would need `assetlinks.json` hosted on blipfoto.com,
which isn't ours to place), enabling it adds the app to the chooser rather than hijacking links
silently — which is exactly the behaviour `rules.md` asks for.

---

## 17. Android project configuration

The `android/` project is **checked into the repo**, not generated at build time — it holds the
manifest edits, backup rules, the custom messaging service (§11), the activity-alias (§16) and
`google-services.json`.

### SDK levels

| | Value | Source |
|---|---|---|
| `minSdkVersion` | **24** (Android 7.0) | Capacitor 8's floor |
| `compileSdkVersion` | **36** | Capacitor 8 default |
| `targetSdkVersion` | **36** | Capacitor 8 default; also what Play requires for new submissions |

**This closes the item `rules.md` left open** — "whatever floor the chosen build framework imposes"
is minSdk 24, and it should not be narrowed further. Re-check on any Capacitor major upgrade, since
this floor moves.

### Permissions

Request exactly these, nothing more. Every one is requested at point of use, never at launch.

| Permission | Why | Screen |
|---|---|---|
| `INTERNET` | — | everywhere |
| `POST_NOTIFICATIONS` | Push and reminders (Android 13+) | `FLW-20`, `SCR-25` |
| `CAMERA` | *Take a photo* only | `SCR-09` |
| `ACCESS_COARSE_LOCATION` / `ACCESS_FINE_LOCATION` | Nearby feed, my-location | `SCR-02`, `SCR-04`, `SCR-12` |

**No storage permissions** — the system photo picker grants per-item access (`SCR-09`).
**No `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM`** (§12).

### Manifest and resources

- `android:allowBackup="false"` (§8).
- An intent filter for `bmobile://` (both the OAuth redirect and content links, §16), plus the
  **disabled** `<activity-alias>` carrying the non-`autoVerify` filter for
  `https://www.blipfoto.com` (§16).
- A notification channel per category (activity, system alerts, reminders, uploads) so users can
  tune them in system settings. **No custom `FirebaseMessagingService`** — §11's decision keeps
  pushes as ordinary notification messages, which is what removes the need for one.
- Adaptive launcher icon and splash screen from `assets/`, via the existing
  `scripts/copy-icons.mjs` conventions where they apply.
- **Application ID: `io.github.ianmstevenson.bmobile`** — a reverse-domain form of a namespace the
  project demonstrably controls. Adequate for development and review; revisit before a first Play
  submission, since it is permanent from that point on.

### Release

Manual, matching `notification-service.md`'s stance that app publication and service deployment are
both deliberate manual steps. Signing keys live outside the repo. The root `version.generated.json`
mechanism can feed the app's displayed version the same way it feeds `b-view` and `b-ark`, and
should, so all four surfaces report versions the same way.

---

## 18. Configuration and secrets

Build-time configuration via Vite env vars (`import.meta.env.VITE_*`), with a committed
`.env.example` and a gitignored `.env.local` — the pattern `b-oss` already uses.

| Variable | Contains | Secret? |
|---|---|---|
| `VITE_BLIPFOTO_CLIENT_ID` | The app's registered client id | No — also the anonymous bearer |
| `VITE_OAUTH_REDIRECT_URI` | `bmobile://oauth/` | No |
| `VITE_NOTIFY_SERVICE_URL` | `b-push` base URL | No |
| `VITE_NOTIFY_REGISTRATION_SECRET` | Shared registration secret | **Not in git** |
| `VITE_MAP_TILES_KEY` | Tile provider key | **Not in git** |

**Anything in the bundle is extractable**, and the architecture must not pretend otherwise.
`notification-service.md` already accepts this for the registration secret, describing it as a
coarse gate rather than a credential; the same honesty applies to the tile key, which is why the
provider choice in §13 should favour one whose free tier tolerates a public key.

`google-services.json` is not secret (it contains no server key) but is environment-specific;
commit it for the single production Firebase project.

---

## 19. Testing

**Vitest + Testing Library**, same as the rest of the monorepo. Three layers, deliberately
lightweight:

1. **Pure logic** — error mapping, the write-gate selector, upload-queue state transitions, BBCode
   preset, image-cache TTL arithmetic, deep-link resolution. Plain unit tests; this is where the
   density should be, because these are the rules most likely to be got subtly wrong.
2. **Screens** — rendered in jsdom with `src/platform/` mocked and `b-api` stubbed (`msw` is already
   a `b-api` dev dependency). The target is one test per screen asserting its four
   loading/empty/error/loaded states, since `rules.md` mandates them uniformly and they are the
   easiest thing to skip.
3. **On-device** — manual for v1. No Appium or Detox; the ratio of setup cost to value is wrong for
   a project this size, and the things that genuinely need a device (OAuth redirect, multipart
   upload, push delivery, exact-alarm-free reminder timing) are better covered by a short manual
   checklist, run once as each is built, than by dedicated device automation. Neither the OAuth
   redirect nor the multipart upload needs a pre-build spike — both are closed by source-reading
   (§7, §8); the checklist is the same first-run verification every new module gets.

**Browser-mode development.** `vite dev` should run the app in a desktop browser with web fallbacks
for the platform modules, which requires one extra thing: Blipfoto serves no CORS headers, so
`vite.config.ts` needs a `server.proxy` entry for `api.blipfoto.com`. That is a dev-only convenience
and must not have a production counterpart — on device, everything goes through native HTTP (§7).

---

## 20. Accessibility, responsiveness and performance

These are `rules.md` requirements; what follows is only how they land in this stack.

- **Accessibility.** Ionic components carry roles, labels and focus management; the work is on
  app-specific components (thumbnail grids, the BBCode editor toolbar, map controls). Enforce
  48×48dp minimum targets in `tokens.css` rather than per-component. **`rules.md` flags system font
  scaling as an open risk for a WebView app, and it is a real one**: the WebView does not
  automatically apply the Android font-scale setting to CSS. It must be read explicitly
  (`window.devicePixelRatio` is not it — read the OS setting and set a root font-size multiplier),
  and layouts must be built in relative units so a 200% scale reflows rather than clips. Test this
  early; retrofitting it across 28 screens is far worse than building with it.
- **Responsiveness.** One navigation model at every size, per `rules.md` — no two-pane tablet
  layout. Grids derive column count from available width via CSS grid `auto-fill` with a minimum
  track size; nothing is portrait-locked; state survives rotation because it lives in stores and
  route params rather than in view controllers.
- **Performance.** Request appropriately-sized thumbnails in feeds and full-size only on
  `SCR-06`/`SCR-07` (`rules.md`); lazy-load off-screen images (`loading="lazy"` plus an
  `IntersectionObserver` in `<CachedImage>`); virtualise only if a real device shows a problem —
  the grids are image-bound, not DOM-bound. Route-level code splitting keeps first paint fast, with
  MapLibre in particular loaded lazily since it is by far the largest dependency (~19MB unpacked,
  much less shipped) and two screens use it.

---

## 21. What this changes elsewhere

Work these decisions create elsewhere. The `ImplementationSpec/` and `AppSpec/` items below **have
now been applied**; the `b-oss` code items have not, and are the outstanding work.

### Code, in `b-oss`

1. **`b-api` — two seams, not one** (§7). `platform-and-reuse.md` records the transport seam; the
   **multipart seam** is new and the more consequential of the two. Its signature must take a file
   *reference* rather than a `Blob`, or a native implementation cannot be expressed at all.
2. **`b-view` — the backup/live split**, and **`b-view-backup`** as a new package (§2). Should land
   *before* the app starts consuming `b-view`.
3. **`b-tokens` — a new package** for the shared token values and the written style guidance (§2).

### `ImplementationSpec/` — **applied 2026-08-03**

4. **`notification-service.md`** — polling rebuilt around counts only, the mis-scoped
   comment-polling issue closed, hidden-member filtering explicitly *not* a service responsibility,
   and a prohibition list on the endpoints that clear on read. **Done.**
5. **`platform-and-reuse.md`** — its "What this document does not cover" section is now covered
   here; its multipart-spike preference order is superseded by §7; and its "deferred, not decided
   now" note on a shared token package is superseded by §2. **Not applied** — the document reads
   correctly as a decision record, and `ImplementationSpec/README.md` states the precedence.
6. **`b-api-updates.md`** — two additions, both docs-vs-reality of the kind that file collects: the
   published docs describe `[s]` as rendering `<strike>` where the platform emits `<s>` (§14), and
   a notification row carries a `has_full_content` flag the client model omits. **Deferred with the
   rest of `b-api`.**

### `AppSpec/` — **applied 2026-08-03**

7. **`rules.md`** — hiding's promise stands **unqualified** (the digest/opt-in design is moot), but
   three things were added: notification-stream suppression is best-effort, hiding is keyed by
   username and doesn't survive a rename, and the redundant explicit mark-read call is removed.
8. **`FLW-16`** — tap targets degrade to inbox-level, the push payload is a count, hidden-member
   suppression on push is recorded as an accepted limitation, and the follow-request routing
   special case is captured.
9. **`SCR-23` / `SCR-24`** — the two streams' very different shapes: no timestamps or per-item
   unread on notifications, the best-effort href heuristic, bulk/promo messages arriving
   indistinguishably, and `SCR-24`'s first-fetch-clears-everything trap.
10. **`SCR-06`** — opening one's own entry with comments clears comment-unread. Previously
    unrecorded, and it isn't only `SCR-24` that does this.
11. **`data-model.md`** — the Notification entity asserted a type, a target and an actor. It has
    none of them; corrected.
12. **`endpoints.md`** — the two clear-on-read side effects stated precisely, the redundant
    mark-read call removed, and a warning not to switch to the near-identical unread-totals
    resource that reports the wrong count.
13. **`SCR-11`** — its toolbar names *"bold, italic, link, quote"*. **`quote` is not a supported
    tag**, and underline and strikethrough are missing; the real set is the five in §14.
14. **`rules.md`, smaller items** — pin **minSdk 24** where it defers to "whatever floor the chosen
    build framework imposes" (§17), and extend the no-remembered-blocked-state rule to cover
    **reminders** as well as push (§12, Q6).

### Root `README.md`

12. The prerequisites section specifies `blipfoto-app://oauth` as the redirect and requires it be
    kept distinct from a `blipfoto://` content scheme. §16 supersedes both. **This needs settling
    before the app is registered with Blipfoto**, since the registration takes one redirect URI.

---

## Decisions taken

Every question this document raised has been answered, and the reasoning is kept here so it isn't
lost. **Nothing is open.**

### Closed

| | Question | Answer |
|---|---|---|
| **Q1** | App package name | **`b-mobile`**. `b-app` was too generic; `b-droid` reads better but wrongly implies Android-only, which the cross-platform requirement in `rules.md` rules out. `b-push` confirmed for the service — deliberately named for the capability, not the app, so a second client can register with the same service rather than needing a second one |
| **Q2** | Android application ID | **`io.github.ianmstevenson.bmobile`** for now; revisit before a first Play submission, after which it is permanent (§17) |
| **Q3.1** | Multipart via query-string params | **Closed as a non-option.** The API does not accept entry fields from the query string on a multipart `POST`/`PUT`. The body is assembled by the app (§7). No spike time to be spent here |
| **Q3.2** | OAuth fragment through a custom-scheme redirect | **Not a real unknown — standard, production-proven behaviour (§8).** Dropped from TODO H; the only remaining check is that `appUrlOpen` fires for this app's manifest wiring, done as ordinary first-pass dev on the deep-link handler, not a spike |
| **Q4** | Foreground service for uploads | **No for v1.** Ongoing local notification plus resume-on-launch; revisit only if real use shows uploads being killed (§9) |
| **Q6** | Reminders and the notification permission | **Yes — identical treatment to push.** A refusal turns the reminder setting off; no third state (§12) |
| **Q7** | Map tile provider | **MapTiler to start**, behind the adapter that makes it cheap to change (§13) |
| **Q8** | BBCode tag set | **Five tags**, now specified exactly in §14 |
| **Q9** | Reading the per-account link capability | **Not possible — closed as an accepted API limitation.** No flag is exposed. The link button is always shown; links are ignored server-side for accounts below the anti-spam threshold, and the app does nothing about it (§14) |

### Also closed — Q5

<a id="q5"></a>
**Q5 — Hidden members and push.** Closed 2026-08-03, and not by choosing between the options on the
table. **Every** Blipfoto endpoint returning notification or comment content marks it read, so the
service can poll counts only (§11) — which means it never
obtains an actor for *any* activity type, and there is nothing for any filtering mechanism to act
on. The digest-and-consent design is moot; hiding's device-local promise stands unqualified; and
`FLW-16` records suppression-on-push as an accepted platform limitation.

The same analysis closed **TODO I item 2**, which framed this as a comments-only problem. It never
was.

**Nothing in this document is now open.** The remaining work is the `b-oss` code changes in §21 —
`b-api`'s two seams, the `b-view` split, and `b-tokens` — none of which is a question.

---

## Cross-references

- [`platform-and-reuse.md`](platform-and-reuse.md) — the platform decision and reuse plan this
  continues; §7 and §21 amend it.
- [`notification-service.md`](notification-service.md) — the service contract §11 implements
  against; §21 lists the one addition it needs.
- [`b-api-updates.md`](b-api-updates.md) — separate from §7's seams: that file is about `b-api`'s
  *docs*, this is about its *code*.
- [`AppSpec/rules.md`](../AppSpec/rules.md) — the cross-cutting behaviour almost every section here
  implements.
- [`AppSpec/api-appendix/auth.md`](../AppSpec/api-appendix/auth.md) — the token model §6 and §8
  realise.
- [`AppSpec/01-information-architecture.md`](../AppSpec/01-information-architecture.md) — the screen
  and flow inventory §5's route table maps.
