# b-ark browser plugin — design spec (in progress)

> Status: **de-risking COMPLETE (2026-06-12).** All four high-risk unknowns validated against
> the live account. Remaining work is construction — see "Build plan" below. Work is on branch
> `Experimental-b-ark-chrome-branch` (frequent small commits; each experiment revertible).

## Current status & build plan (start here)

**Validated (spikes committed on the branch — proven reference code, not throwaway logic):**

| Spike (in `spikes/`)        | Proves                                                                                                            | Status |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------ |
| `fsa-bg-tab`                | FSA grant persists across restart after one-time "Allow on every visit"; unfocused background tab writes silently | ✓      |
| `option-c-e2e`              | One extension page fetches the API (CORS-bypass) + writes JSON + downloads image to the FSA folder                | ✓ live |
| `oauth-distributed-capture` | Distributed implicit OAuth works in Chrome via `webRequest.onBeforeRedirect` capture — token fragment preserved   | ✓ live |
| `oauth-flow`                | `launchWebAuthFlow` attempt — **dead-end**, kept only as a record                                                 | n/a    |

**Done in-repo:** PlatformIO `Buffer`→`Uint8Array` tidy (committed; typecheck/171 tests/lint green).

**Reusable spike code → production:**

- `option-c-e2e/page.js` FSA ops (`getDirectoryHandle`/`getFileHandle`/`createWritable`, fetch→write) → `BrowserPlatformIO`.
- `oauth-distributed-capture/sw.js` `webRequest.onBeforeRedirect` capture → the OAuth module.
- `host_permissions`: `https://api.blipfoto.com/*`, `https://*.cloudfront.net/*`, `https://*.blipfoto.com/*`.

**Build order:** see **"Build sequence"** below — the full phased plan with per-phase model
assignments (Sonnet/Opus), acceptance criteria, and copy-paste handoff prompts.

**External (user) action when ready (Phase 1/2):** register a **separate distributed** Blipfoto
app with redirect `bark-chrome://oauth/callback`, and put its `client_id` where the extension can
read it at build time.

## Build sequence — phases, models, and handoff prompts

> **How to use this:** Do one phase per session. Each phase says which **model** to use, what
> "done" means, and ends with a **handoff** the running agent must perform. When a phase finishes,
> the agent tells you it's done and gives you the exact prompt for the next phase (and which model
> to switch to). You just open a new session with that model and paste the prompt.

**Models at a glance:** Phase 1–2 **Sonnet** · Phase 3 **Opus** (touches the shipped desktop app)
· Phase 4–6 **Sonnet**. Every session: branch `Experimental-b-ark-chrome-branch`, Windows/PowerShell,
commit per sub-step, keep `npm run typecheck` / `lint` / `test` green.

**Rule for every agent:** when your phase's acceptance criteria are met, commit, then end your turn
with: _"Phase N done — <one line>. Next is **Phase N+1**, which needs **<MODEL>**. Start a new
<MODEL> session and paste this:"_ followed by the next phase's paste-prompt (below), verbatim.

---

### Phase 1 — App foundation & primitives · **Sonnet**

**Goal:** a loadable MV3 extension skeleton with the proven primitives wired (no real backup, no
polished UI yet).
**Do:**

- New workspace package `packages/b-ark-chrome` (add to root `workspaces`; `type: module`; deps
  `@b-oss/b-api`, `@b-oss/backup-engine`; devdeps `vite`, `@crxjs/vite-plugin`). tsconfig (strict).
- Vite + `@crxjs/vite-plugin` MV3 build → `dist`. `manifest.json`: `host_permissions`
  `https://api.blipfoto.com/*`, `https://*.cloudfront.net/*`, `https://*.blipfoto.com/*`;
  permissions `["storage","webRequest","webNavigation","tabs"]`; SW; action; a pinned `key`.
- `BrowserPlatformIO` (implements `PlatformIO` over an FSA `FileSystemDirectoryHandle`) — port the
  FSA ops from `spikes/option-c-e2e/page.js` (read/write/ensureDir/exists/list/delete; `rename` =
  copy+delete; `downloadFile` = fetch→write; split paths, filter empty segments).
- FSA handle persistence in IndexedDB + `queryPermission`/`requestPermission` helpers incl. the
  one-time "Allow on every visit" re-grant (mirror `spikes/fsa-bg-tab`).
- OAuth module — port `webRequest.onBeforeRedirect` capture from
  `spikes/oauth-distributed-capture/sw.js`; use b-api `buildImplicitGrantUrl` /
  `parseImplicitGrantCallback`; scheme `bark-chrome://oauth/callback`.
- Token storage: AES-GCM, non-extractable key in IndexedDB, ciphertext in `chrome.storage.local`.
  **Done when:** loads unpacked; you can sign in (OAuth → encrypted token stored) and pick + persist
  a folder with the re-grant flow. (No backup yet.)
  **Paste-prompt (Phase 1, Sonnet):**

```
b-ark-chrome build — PHASE 1 (app foundation), use Sonnet. Read
C:\Users\IanSt\.claude\plans\i-d-like-to-explore-smooth-church.md: the "Current status & build
plan" block, then "Build sequence → Phase 1". Do exactly Phase 1. Branch
Experimental-b-ark-chrome-branch; Windows/PowerShell; commit per sub-piece; typecheck+lint+test
green. Reuse the proven spike code the plan points to. When Phase 1's acceptance is met, perform
the Phase 1 handoff.
```

---

### Phase 2 — Real backup vertical slice · **Sonnet**

**Goal:** the extension performs a real backup using the **real** `backup-engine`.
**Do:** a bare backup page that builds an `AccountBackupConfig` from the signed-in profile,
instantiates `BlipfotoClient(token)` + `BrowserPlatformIO(dirHandle)` + `LogManager` +
`BackupEngine`, and calls `run()`; render progress from `onEvent`. Bounded run is fine (cancel
after a few entries) — the point is to confirm the packages bundle/run under MV3 and write the
correct `entries/YYYY/…` layout.
**Done when:** a real backup writes correct files to the chosen folder; opening that folder in
b-view shows the entries (interop); closing + reopening resumes via `_checkpoint.json`.
**Paste-prompt (Phase 2, Sonnet):**

```
b-ark-chrome build — PHASE 2 (real backup vertical slice), use Sonnet. Read the plan's
"Build sequence → Phase 2" and do exactly that, building on Phase 1. Branch
Experimental-b-ark-chrome-branch; Windows/PowerShell; commit per piece. When Phase 2's
acceptance is met, perform the Phase 2 handoff (next phase is OPUS).
```

---

### Phase 3 — UI kit extraction & rename · **Opus** ⚠ touches the shipped desktop app

**Goal:** factor `b-ark-ui` into a shared kit + the electron shell **without regressing desktop b-ark.**
**Do:**

- Create `packages/b-ark-ui-components`: move the account-agnostic presentational components
  (`Avatar`, `StatusBar`, `BackupBanner`, `AuthErrorBanner`, `ToastHost`, `InfoBadge`,
  `SplitButton`, `LogPanel`) + the `BackendContext` interface + shared view types. Pure, prop-driven.
- Rename `packages/b-ark-ui` → `packages/b-ark-ui-electron` (keep `App`, `Sidebar`, `AccountRow`,
  `AppContext` reducer, `ElectronBackend`); import leaves from `b-ark-ui-components`. Update the
  package name, all imports in `b-ark` (the electron app), and root `workspaces`.
  **Done when:** `typecheck`/`lint`/`test` green AND the desktop b-ark builds and runs unchanged;
  components import cleanly from `b-ark-ui-components`. Granular commits (create kit → move → rename →
  fix imports).
  **Paste-prompt (Phase 3, OPUS):**

```
b-ark-chrome build — PHASE 3 (UI kit extraction + rename), use OPUS — this touches the SHIPPED
desktop app, so be careful not to regress it. Read the plan's "Build sequence → Phase 3" and the
"Package topology" + "Reuse map" sections; do exactly Phase 3. Branch
Experimental-b-ark-chrome-branch; Windows/PowerShell; granular commits; after the refactor,
build/run the desktop b-ark to confirm no regression and keep typecheck/lint/test green. When
Phase 3's acceptance is met, perform the Phase 3 handoff (next phase is Sonnet).
```

---

### Phase 4 — Chrome UI: chip + page + BrowserBackend · **Sonnet**

**Goal:** the real plugin UI.
**Do:** `packages/b-ark-ui-chrome`: `BrowserBackend` implementing `BackendContext` (single-account,
in-process — calls engine/client/io directly; `subscribe` via an emitter); the single-view page
shell (status header, "Back up now", `BackupBanner` progress, **b-view** grid embedded,
settings/log as overlays) composed from `b-ark-ui-components` + `b-view`; the **draggable minimal
chip** content script (shadow DOM, bare icon at rest, expands for amber/red/progress, remembers
position in `chrome.storage`, double-click → open page). Wire into the `b-ark-chrome` app.
**Done when:** chip appears + is draggable on `blipfoto.com` and opens the page; the page shows the
journal (b-view) + backup controls; a backup runs from the page. (See "UI design (concrete)".)
**Paste-prompt (Phase 4, Sonnet):**

```
b-ark-chrome build — PHASE 4 (chip + page + BrowserBackend), use Sonnet. Read the plan's
"Build sequence → Phase 4", "UI model", and "UI design (concrete)"; do exactly Phase 4 on the
clean kit from Phase 3. Branch Experimental-b-ark-chrome-branch; Windows/PowerShell; commit per
component. When Phase 4's acceptance is met, perform the Phase 4 handoff.
```

---

### Phase 5 — Visit-trigger, lifecycle & failure UX · **Sonnet**

**Goal:** the automation and the never-fail-silently behaviour.
**Do:** visit detection (content script) → SW decides if this period's backup is due/incomplete →
**auto-launch** the backup page as an unfocused background tab (singleton) that **self-closes** on
completion unless adopted; period config (daily/weekly) + last-completed state in `chrome.storage`;
RAG semantics (green / amber=working / **red=blocked→SW raises the tab + notification**); one-time
re-grant onboarding; settings (folder, period, Reauthorise, Sign out). See "Auto-launch &
self-close lifecycle" + "Backup trigger model".
**Done when:** visiting `blipfoto.com` triggers a background backup that self-closes; blocked
states go red + intrusive; Reauthorise + Sign out work.
**Paste-prompt (Phase 5, Sonnet):**

```
b-ark-chrome build — PHASE 5 (visit-trigger + lifecycle + failure UX), use Sonnet. Read the plan's
"Build sequence → Phase 5", "Backup trigger model", and the "Auto-launch & self-close lifecycle";
do exactly Phase 5. Branch Experimental-b-ark-chrome-branch; Windows/PowerShell; commit per piece.
When done, perform the Phase 5 handoff.
```

---

### Phase 6 — End-to-end verification & packaging · **Sonnet**

**Goal:** prove it works and package it.
**Do:** run the full "Verification" checklist below; narrow `host_permissions` to the confirmed
hosts; confirm the pinned ext-id `key`; CRX/zip packaging + a README. Fix anything the checklist
surfaces.
**Done when:** every item in "Verification" passes.
**Paste-prompt (Phase 6, Sonnet):**

```
b-ark-chrome build — PHASE 6 (e2e verification + packaging), use Sonnet. Read the plan's
"Build sequence → Phase 6" and "Verification"; run the whole checklist, fix gaps, package.
Branch Experimental-b-ark-chrome-branch; Windows/PowerShell; commit per fix. Report results
against each verification item.
```

---

## Context

We want a Chrome/Edge plugin version of b-ark: a small **status chip** injected onto
Blipfoto pages that opens a b-ark-like UI to back up the logged-in user's journal to a
real folder on disk. Goal: **maximum shared code with the existing desktop app**, behind
clean seams, without regressing the shipped product.

## Decisions locked

| Area               | Decision                                                                                                                                                                                                                                                                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform           | Chrome / Edge only, Manifest V3                                                                                                                                                                                                                                                                                                                            |
| Product role       | Standalone _lite_ product (shares code, free to simplify)                                                                                                                                                                                                                                                                                                  |
| Account model      | **Single account** — whichever Blipfoto user is logged in. No sidebar/account list.                                                                                                                                                                                                                                                                        |
| Storage            | **Real folder on disk via File System Access (FSA)** — same `entries/YYYY/...` layout, so b-view folder mode + b-ark interop work unchanged                                                                                                                                                                                                                |
| Tokens             | **Encrypted at rest** — AES-GCM via Web Crypto, non-extractable key in IndexedDB, ciphertext in `chrome.storage.local`                                                                                                                                                                                                                                     |
| Failure UX         | Backup **never fails silently** — blocked states (permission/auth) turn the chip **red** and the SW surfaces the tab intrusively                                                                                                                                                                                                                           |
| Execution          | **Option C** — a single extension page fetches the API (CORS-ok), runs the engine, writes the folder, and embeds b-view. Engine reused as-is, one grant, no relay.                                                                                                                                                                                         |
| Backup trigger     | **Visit-driven, auto-launched** — on a due visit the chip → SW **opens the backup page as an unfocused background tab**; it runs and **closes itself on completion** (unless the user adopted it). Folder access is granted **once** ("Allow on every visit") during onboarding and persists across all restarts — silent thereafter. No background clock. |
| Main UI            | **Draggable minimal status chip** (content script, bare icon at rest) + a **single-view extension page** (b-ark-like, b-view embedded; settings/log as overlays). **No side panel.**                                                                                                                                                                       |
| Reuse architecture | Split `b-ark-ui` into a shared component kit + per-surface shells (see topology)                                                                                                                                                                                                                                                                           |

## Seams (the backbone — already exist, still valid)

1. **`PlatformIO`** — [packages/backup-engine/src/platform.ts](packages/backup-engine/src/platform.ts).
   The whole backup algorithm runs through 9 file/network methods; imports no `fs`. Browser
   gets a **`BrowserPlatformIO`** over an FSA `FileSystemDirectoryHandle`. _(Tidy: change
   the interface from Node `Buffer` to `Uint8Array`; `Buffer extends Uint8Array` so the
   Electron impl keeps working.)_
2. **`BackendContext`** — [packages/b-ark-ui/src/backend.ts](packages/b-ark-ui/src/backend.ts).
   ~21 operations the UI calls; components only ever use `useBackend()`. Browser gets a
   **`BrowserBackend`** that calls the engine directly (no IPC — everything runs in one JS
   context). The interface moves into the shared kit.

b-api ([oauth-flow.ts](packages/b-api/src/oauth-flow.ts) already parameterises
`clientId`/`redirectUri`) and b-view need **no changes**.

## Package topology

Symmetric UI-vs-app split on both surfaces; `BackendContext` is the universal data seam.

```
b-api                  (shared, unchanged)   Blipfoto HTTP client
backup-engine          (shared, +Uint8Array) algorithm + PlatformIO interface
b-view                 (shared, unchanged)   journal viewer (folder mode)
b-ark-ui-components     NEW (extract)         presentational kit + BackendContext iface + view types
  ├─ b-ark-ui-electron  (rename of b-ark-ui)  desktop multi-account shell + ElectronBackend
  │    └─ b-ark         (app)                 Electron main, ElectronPlatformIO, IPC
  └─ b-ark-ui-chrome    NEW                    single-account page shell + chip + BrowserBackend
       └─ b-ark-chrome  NEW (app)             manifest, content script, service worker,
                                              BrowserPlatformIO, CRX build
```

## UI model

**The chip** (content script on `blipfoto.com`, shadow DOM so it can't touch Blipfoto's
styling):

- Draggable, **remembers its position** (`chrome.storage`).
- Shows **account icon + RAG dot**; while a backup runs, a **compact progress indicator**
  (fed by status the page/SW write to `chrome.storage`).
- Holds **no token, no FSA handle** (wrong origin) — it reads status and talks to the SW.
- **Auto-launch:** on a due visit it asks the SW to open the backup page (see lifecycle).
- **Double-click** opens/focuses the page on demand (to watch progress or browse the journal).

**The main page** (extension-origin window — does the real work):

- Fetches the Blipfoto API (CORS-ok), runs the engine, writes the folder via
  `BrowserPlatformIO`, and **embeds b-view** for browsing.
- Slim single-account shell: status header + "Back up now" + progress + journal + log +
  settings. Where the FSA folder is chosen/granted.
- **First run / onboarding** happens here in a **focused** window: OAuth sign-in and folder-pick
  need a user gesture. FSA quirk: the persistent "Allow on every visit" prompt only appears on the
  _second_ visit, so onboarding completes the one-time re-grant on the first restart; after that
  all backups run silently with no prompt.

**Auto-launch & self-close lifecycle** (the SW owns the backup tab as a singleton):

- Chip (due visit) → SW → `chrome.tabs.create({ url: 'backup.html', active: false })` — an
  **unfocused background tab**, no gesture needed, never steals focus. One backup tab at a time.
- Page runs the backup (granted handle → silent writes); pushes progress to `chrome.storage`
  so the chip animates.
- On completion → page → SW → `chrome.tabs.remove()` **unless the user focused/adopted it**
  (tracked via a focus flag); an adopted tab stays open as the app.
- **Cross-restart persistence — confirmed ✓.** After a one-time **"Allow on every visit"**
  re-grant (done once during onboarding, on the first restart after the folder pick), the grant
  persists across all later restarts: the page/background tab loads as `granted` with **no prompt
  and no gesture**, so the unfocused auto-launch tab writes silently every session. **No
  per-session click.** A RED intrusive prompt then occurs only on a genuine error — auth expiry,
  write failure, or the user revoking access in Chrome settings.
- **Blocked by an error** (auth expired / write failure / grant _revoked_ mid-flight): page → SW
  → **chip goes RED and the SW surfaces it intrusively** — raises the backup tab
  (`chrome.tabs.update({active:true})` + window focus), optionally a notification — landing the
  user on one-click Reauthorise / re-grant. **A backup must never fail silently.** _(Amber =
  benign/working; red = error needing intervention.)_

## UI design (concrete)

**Chip** (draggable pill on Blipfoto, shadow DOM; drag = move, double-click = open, hover =
tooltip). States:

```
 RAG:  GREEN = up to date   AMBER = working / transient retry (benign, no action)
       RED = blocked, needs you (permission / auth / failure) -> surfaced intrusively

 IDLE / GREEN  (resting = BARE ICON, ~28px, no label)
        (o).          <- avatar + green status ring; hover: "Backed up 2h ago"

 expands into a labelled pill when working or blocked:

 BACKING UP / AMBER         RED - PERMISSION           RED - AUTH
   .---------------.         .------------------.        .-----------------.
   | (o)(~) 142/330|         | (o)* Fix access >|        | (o)* Reauthorise|
   '---------------'         '------------------'        '-----------------'
   working; retries          backup BLOCKED;             token expired;
   transient errors          SW raises the tab           SW raises the tab

   (o)=avatar  *=status ring (RAG)  (~)=progress ring
   On RED the SW FOCUSES the backup tab (+ optional notification) - never silent.
```

**Main page** (dedicated extension tab):

```
+- b-ark ------------------------------------- (o) username  *green -+
|  Last backup: 2h ago . 330 entries     [ Back up now ]  (gear) log |   TopBar + StatusBar
+-------------------------------------------------------------------+
|  (~) 142/330  downloading images...                        [stop] |   BackupBanner (running only)
+-------------------------------------------------------------------+
|  2024 v                                                            |
|  [img] [img] [img] [img] [img] [img]                              |
|  [img] [img] [img] [img] [img] [img]              b-view grid     |
|  [img] [img] [img] [img] [img] [img]                              |
|                                      [ < 1 2 3 ... > ]            |   b-view Pagination
+-------------------------------------------------------------------+
```

**Single view** — the journal grid is home; **gear → Settings** and **log → Log** open as
light **overlays** (not tabs); a thumbnail click → b-view `EntryDetail` overlay:

```
+- Settings -------------------------------------------------------+
|  Backup folder:  D:\Blips\ian              [ Change folder ]      |
|  Backup every:   ( ) Day   (*) Week                              |
|  Account:  (o) username        [ Reauthorise ]  [ Sign out ]     |
|  Folder access: granted *green   .   v0.1.0                      |
+------------------------------------------------------------------+
 First-run / re-grant bars (AuthErrorBanner-style):
  [ 1. Sign in  ✓ ] [ 2. Choose a backup folder > ]
  [ ! Folder access needs renewing.  [ Grant ] ]
```

**Component mapping (reuse made concrete):**

| Region                                                           | Source                                        |
| ---------------------------------------------------------------- | --------------------------------------------- |
| TopBar, StatusBar, BackupBanner, LogPanel, sign-in/re-grant bars | shared `b-ark-ui-components` (extracted)      |
| ThumbnailGrid, EntryDetail, Pagination                           | `b-view` as-is                                |
| Single-account page shell, chip, lite SettingsPanel              | **new** in `b-ark-ui-chrome` / `b-ark-chrome` |

## Backup trigger model (visit-driven)

- **Scale note:** a real account can be large (test account `cyclops` = 6752 entries), so the
  _first_ backup is long and will span many visits/sessions — the `_checkpoint.json` resume is
  load-bearing, not a nicety. Routine (incremental) backups thereafter are small.
- **Period**: daily or weekly (a setting). State = "last completed backup for period".
- On a Blipfoto visit the chip checks (via SW): is this period's backup missing/incomplete?
  If so it **auto-launches** the backup page (see lifecycle above), which **starts or
  resumes** (existing `_checkpoint.json` gives free resume).
- "Re-trigger until complete" = each visit re-checks and resumes until the period is marked
  done. The **visit is the scheduler** — no MV3 background timer. Blocked-state handling
  (permission/auth) is **red + intrusive** — see the lifecycle.

## File System Access — findings (from the proven VHA extension)

- **Handles persist via raw IndexedDB, per origin.** A serialized `FileSystemDirectoryHandle`
  survives browser restarts (structured-clone into IDB). A **content script can hold and use
  one at the page origin** (e.g. `blipfoto.com`); an extension page holds its own at the
  **extension origin**. **Handles do not cross origins — each origin must pick the folder
  independently.** _(Corrects an earlier wrong assumption that the handle must live on the
  extension origin.)_
- **Re-grant is cheap and, in practice, rare.** Spec says permission resets to `prompt` on
  restart; with "Allow on every visit" the user reports **not** being re-prompted each
  restart. Pattern: `queryPermission()` on load **and before every write**; `requestPermission()`
  only from a click; show a one-click re-grant bar when lapsed.
- **No silent background writing — design rule, not a maybe.** VHA does **all** writes from a
  visible page's content script: **no offscreen document, no service-worker writes.** Authors
  who know FSA well chose not to. We treat silent offscreen/SW writing as **ruled out** and do
  not design around it. Backup runs **where a page is alive.**
- **Gotchas to replicate:** per-write permission gate (catches mid-session revocation); wrap
  `queryPermission` in try/catch (stale handle after reinstall throws → treat as no handle);
  filter `AbortError` on picker cancel; feature-detect `showDirectoryPicker`.

## Hard constraints: CORS × FSA contexts (the pincer)

Two MV3 rules collide and drive the whole architecture:

- **API fetch → extension-origin context only.** MV3 content scripts cannot make
  cross-origin fetches; only the **service worker / extension pages** bypass CORS via
  `host_permissions`. Blipfoto sends no CORS headers, so the API can't be called from the
  `blipfoto.com` content script — it must go through the SW or an extension page.
- **User-folder write → window/document context only.** FSA file-picker handles work in a
  **window** (content script's page, or an extension page), **not** in a service worker
  (OPFS-sync is worker-only and doesn't cover picker handles). **Offscreen documents are
  out** — they expose only `chrome.runtime` and are not the supported home for FSA writes.

**Consequence:** no single _background_ context can both fetch and write, so **fully silent
automatic backup to an on-disk folder is impossible in MV3 + FSA — a live window is
mandatory.** The only context that does both fetch _and_ write together is a **real
extension page**. Anything that backs up "while browsing" must write from the Blipfoto
content-script window and **relay API fetches through the service worker**.

## Reuse map (component-level)

| Bucket                                              | Items                                                                                                                                                |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Shared kit** (extract → `b-ark-ui-components`)    | `Avatar`, `StatusBar`, `BackupBanner`, `AuthErrorBanner`, `ToastHost`, `InfoBadge`, `SplitButton`, `LogPanel` — already prop-driven/account-agnostic |
| **Shared already**                                  | b-view (`ThumbnailGrid`, `EntryDetail`, `DatePicker`, …) embedded in the page                                                                        |
| **Plugin-new** (`b-ark-ui-chrome` / `b-ark-chrome`) | draggable chip, single-account page shell + state, `BrowserBackend`, `BrowserPlatformIO`, visit-trigger settings                                     |
| **Desktop-only** (stays put)                        | `Sidebar`, `AccountRow`, multi-account `App.tsx`, `AppContext` reducer, `ElectronBackend`, scheduler                                                 |
| **Adapt**                                           | `ChooseFolderScreen` → FSA picker; `HomeScreen` → single-account                                                                                     |

## OAuth (RESOLVED ✓ — distributed flow works in Chrome, no secret, no backend)

- **Distributed app (implicit, no secret) is the flow.** Web-app needs a `client_secret` passed
  in the authorize querystring (unshippable in an extension); `launchWebAuthFlow` can't do the
  custom-scheme redirect distributed requires (https `chromiumapp.org` only).
- **Capture works (confirmed live, `spikes/oauth-distributed-capture`):** open the authorize URL
  in a tab; an observational `chrome.webRequest.onBeforeRedirect` listener (host_permission on
  `*.blipfoto.com`) reads the `…#object=Token&access_token=…&token_type=bearer&username=…` 302
  **with the fragment intact**. Parse with b-api's `parseImplicitGrantCallback`; close the tab.
- **Use a DEDICATED custom scheme** (e.g. `bark-chrome://oauth/callback`), **not** `b-ark://` —
  if the desktop b-ark is installed, Chrome could hand a `b-ark://` redirect to the OS protocol
  handler (the desktop app) instead of our capture. Register a **separate distributed Blipfoto
  app** for the extension with that scheme (own `client_id`; keeps desktop rate-limits/revocation
  separate).
- The custom-scheme redirect does not embed the extension id → no ext-id pinning needed for OAuth.

## Decision detail (all resolved)

1. **Execution architecture — RESOLVED: Option C.** A single extension page fetches + runs the
   engine + writes the folder + embeds b-view (one context, one grant, engine as-is, no relay).
   **Auto-launched** as an unfocused background tab by the chip/SW and **self-closing** on
   completion (unless adopted); degrades to the double-click nudge when a re-grant is needed.
   _(B′/H rejected — they fracture the engine across contexts for automation we recover via the
   background tab.)_
2. **Settings scope — RESOLVED (lite).** Configurable: backup period (daily/weekly) and the
   folder; account actions **Reauthorise** (`reauthoriseAccount`, reused) + **Sign out**.
   **No image-variant setting** — keep b-ark's existing variant logic as-is. Other engine knobs
   (redo count, gap-check) keep b-ark defaults, hardcoded. Config in `chrome.storage` (no
   portable `b-ark-settings.json`).
3. **Token storage — RESOLVED: Web Crypto, encrypted at rest.** AES-GCM with a
   **non-extractable** `CryptoKey` generated once and kept in IndexedDB (key bytes never
   exposed to JS); token ciphertext + IV in `chrome.storage.local`. Defeats casual
   storage/disk dumps — the honest ceiling in a browser.
4. **Packaging — implementation detail.** `@crxjs/vite-plugin` build; **pin the extension ID
   via a manifest `key` BEFORE registering the Blipfoto app** (the OAuth redirect embeds the
   ID); Chrome Web Store listing.

## De-risking spikes (do before committing to build)

1. **FSA persistence — RESOLVED ✓ (`spikes/fsa-bg-tab`).** Confirmed on the extension origin:
   pick → (first restart shows `prompt`) → one `requestPermission()` re-grant where the user chose
   **"Allow on every visit"** → **every subsequent restart loads as `granted` with no prompt**, and
   the **unfocused background tab writes silently**. So Option C is **fully automatic after a single
   one-time re-grant** — no per-session click. The persistent prompt only appears on the _second_
   visit (the documented trigger), so onboarding does the re-grant once after the first restart.
   Silent offscreen/SW writing stays ruled out.
2. **CORS — RESOLVED ✓ (live, `spikes/option-c-e2e`).** An extension page fetched
   `api.blipfoto.com` (profile/journal/entry, all 200) AND downloaded an image cross-origin
   AND wrote both JSON + image to the FSA folder, **all in one context** — Option C validated
   end-to-end against the live account. `host_permissions` = `https://api.blipfoto.com/*` +
   **`https://*.cloudfront.net/*`** (image CDN is `d3jf2jipiivcgq.cloudfront.net`; wildcard
   since CloudFront subdomains can rotate). Content scripts remain blocked (research).
3. **OAuth — RESOLVED ✓ (`spikes/oauth-distributed-capture`).** `launchWebAuthFlow` ruled out
   (distributed = custom-scheme; web = needs secret). The distributed implicit flow works in
   Chrome by capturing the custom-scheme 302 with `chrome.webRequest.onBeforeRedirect` — the
   token **fragment IS preserved** (captured live). Production: dedicated custom scheme
   (`bark-chrome://…`, not `b-ark://`) + a separate distributed app.

## Verification (when built)

- Load unpacked; chip appears + is draggable + remembers position on a Blipfoto page.
- OAuth round-trip; token in `chrome.storage`.
- Grant a folder once; visit Blipfoto → backup auto-starts; `entries/YYYY/...` + `journal.json`
  - images land on disk in b-ark's exact layout; open that folder in b-view (interop proof).
- Revoke folder access in Chrome settings → chip goes amber → one click re-grants and resumes.
- Close mid-first-backup, revisit → checkpoint resume.
- `npm run typecheck` / `lint` / `test` green after the `Uint8Array` tidy + the kit extraction.

```

```
