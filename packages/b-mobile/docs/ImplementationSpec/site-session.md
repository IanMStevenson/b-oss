# The website session (extras) — design

Status: implemented for the desktop shell; Android and iOS follow ([b-oss#1043](https://github.com/IanMStevenson/b-oss/issues/1043),
[b-oss#1050](https://github.com/IanMStevenson/b-oss/issues/1050)). Behaviour as it is today: BEHAVIOUR.md, "Extra photos".

## Why this exists

The JSON API has no extras upload, edit or read for our app type, and a protected journal's pages are only
visible to a signed-in member. So the app drives Blipfoto's own website the way a person would: it shows
the site's own sign-in page, then loads the site's own pages in a hidden browser page and runs a script
that presses the site's own controls. The page supplies its own tokens; the app never sees a password,
never replays a cookie, and never calls an undocumented endpoint.

## The rule

**A member's website session is never used while another member is selected.** It holds for every
platform and every action (reading as much as writing: another member's view could expose entries the
selected account may not see). It is enforced three ways, so no one layer has to be perfect:

1. **Per-account sessions where the platform can** (`capabilities().site.session === 'per-account'`).
2. **A guard in every page script.** Each script is built with the member the app is acting for and, in
   the same page load as the action, refuses unless the page names exactly that member as signed in
   (`wrong-account`; a signed-out or unnamed page is `needs-login`). The check and the action cannot be
   separated by a session change.
3. **The designated extras account** where a device keeps only one session (below).

Cached results (what a session could read) are keyed by account.

## The seam

```
common TypeScript (ships to every platform)            platform hosts (dumb)
  site knowledge: URLs, page scripts, guard, parsing      Electron shell: windows + partitions
  policy: who may act, sign-in gate, outcomes,            Android: SiteSessionPlugin (WebView)
          designated account                              iOS (later): WKWebView
  UI: extras blocks, notices, dialogs
              \                                          /
               ---- SiteSessionHost (site/contract.ts) --
```

Platforms differ in _values_, never in branches: flows and screens read `capabilities().site.session`
and call `platform/siteSession.ts`, the single place that selects the host. Page knowledge is to move
to the `b-api-web` package ([b-oss#1046](https://github.com/IanMStevenson/b-oss/issues/1046)).

### The contract (`src/site/contract.ts`)

| Call                                                              | Meaning                                                                                                                                                                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signIn(accountId, url)`                                          | Visible window on the site's own sign-in page, starting signed out for that account. Resolves true once the site sends the member past `/account/…`, false if closed.                                               |
| `signOut(accountId)`                                              | Deletes that account's session (the one session where shared).                                                                                                                                                      |
| `runPage({accountId, url, script, timeoutMs, waitForNavigation})` | Loads the page hidden, starts the script at DOM-ready, polls `window.__bmx` (a JSON string) until it reports or the timeout, optionally waits for the page to navigate (a form post), returns `{finalUrl, result}`. |

### Host obligations

- Only https pages on `www.blipfoto.com` are loaded; the account id is validated. Navigation off the site
  is refused. Popups are denied in hidden runs (the sign-in window allows https popups, for social sign-in).
- `'per-account'`: an account's session is invisible to every other account. `'single'`: one session for
  all (common code decides who uses it).
- Runs are one at a time. Hidden windows are **closed gracefully, never destroyed** (destroying one makes
  the next load on the same session fail at once; found and reproduced in a real Electron).
- Every run is bounded by its timeout; a run that times out or throws is logged with its page path and
  duration, and the page script's `status` (and, for an unexpected page, a small description of it).
- Nothing secret is returned: no cookie, password or token reaches JavaScript.
- The script starts at DOM-ready, not `load`: the site's pages pull in third-party scripts and images,
  and a slow one must not hold a run up.

### Capabilities

`site.session`: `per-account` | `single` | `none`.

| Platform | Value                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| desktop  | `per-account` (a persistent Electron partition per account, named by a hash of the account id; the old shared partition is deleted at start-up)                                                                                                                                                                                                                                                                                      |
| android  | `single`, becoming `per-account` at start-up where the WebView supports profiles (`WebViewFeature.MULTI_PROFILE`): `SiteProfiles.java` puts each WebView on a named profile per account before it does anything else and clears that profile on sign-out ([b-oss#1052](https://github.com/IanMStevenson/b-oss/issues/1052)). Reported by the plugin's `isolation()` call; seen as `per-account` on a Galaxy S25 Ultra (WebView 158). |
| ios      | design intent: `per-account` where the OS has separate website data stores, else `single` ([b-oss#1054](https://github.com/IanMStevenson/b-oss/issues/1054))                                                                                                                                                                                                                                                                         |
| web      | `none` (a plain browser has no website session; only public pages are read)                                                                                                                                                                                                                                                                                                                                                          |

`recordSiteSessionIsolation()` lets a native host report `per-account` once it has found out.

## One session for the whole app (`'single'`)

`site/access.ts`. Exactly one account is the **designated extras account** (a preference). The first
account to sign in takes it. An extras action from another account asks first ("Extras are set up for
_A_. Switch to _B_? You will be asked to sign in again"); switching signs the website out and moves the
designation, so the next sign-in is B's. Removing the holder's account frees it. Every screen goes
through the one sign-in gate (`components/useSiteSignInGate.tsx`), so the dialog exists once.

## How a flow runs

1. The flow builds the page script for the member (`siteExtrasScripts.ts`) and the page's URL.
2. `siteRunPage({accountId, …})`; the host loads, runs, returns the script's JSON.
3. The flow reads the status (`ok`, `needs-login`, `wrong-account`, `unexpected-page`, `no-uploader`, …) and
   maps it to an outcome. Adding or removing extras is always: read the edit page → press its controls
   and its own Save → read the page again to confirm. The entry itself is saved through the API first,
   so a failure here never costs the member their entry; any failure ends on a screen that links to the
   entry's edit page.

## Testing

- Unit tests per layer: the page scripts (including the guard, run against a made-up page in jsdom), the
  flows (a fake host), the access policy, the capability table.
- The desktop host was checked in a real Electron against the live site: per-account isolation, the
  guard, sequences of runs. A local stand-in for the site that every host can be tested against is
  [b-oss#1053](https://github.com/IanMStevenson/b-oss/issues/1053).
- Real adds, deletes and saves against a live account remain a manual check.
