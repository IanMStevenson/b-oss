# b-ark-chrome — permission justifications

Reviewer-facing justification for every permission and host permission in
[manifest.json](manifest.json), with a minimization argument for each. Each entry is
grounded in the actual call sites in the code.

`b-ark-chrome` is single-account: it backs up a user's own Blipfoto journal (entries +
images) to a local folder they pick via the File System Access API. Every permission
below exists to (a) authenticate the user to Blipfoto, (b) download their journal, and
(c) coordinate the background service worker, the on-page status chip, and the backup
page.

---

## Declared `permissions`

### `storage`

**What it's used for.** All extension state lives in `chrome.storage.local`: the
settings mirror (`b_ark_settings`), backup status/RAG (`b_ark_status`), the draggable
status-chip state (`chip_*`), lifecycle/feature flags (`folder_ready`,
`backup_lifecycle`, `backup_on_publish`), OAuth progress (`oauthStatus`), and the
**AES-GCM-encrypted** OAuth token (`tokenCiphertext` / `tokenIv` — the non-extractable
CryptoKey itself lives in IndexedDB, never in storage).
Call sites: `token-storage.ts`, `status-storage.ts`, `lifecycle-storage.ts`,
`oauth.ts`.

**Why fewer isn't possible.** The service worker, the content-script chip, and the
backup page are three separate execution contexts that must share one source of truth
and react to each other's changes. `chrome.storage.local` is the only API that is both
(a) reachable from all three contexts and (b) emits cross-context change events
(`chrome.storage.onChanged`, used in `BrowserBackend.ts`, `chip.ts`,
`publish-watch.ts`). IndexedDB (already used for the folder handle and CryptoKey) has no
cross-context change notifications, so it cannot replace this coordination layer.
`storage` is also a low-sensitivity permission with no user-facing install warning.
**Cannot be removed.**

### `tabs`

**What it's used for.** Managing the single backup-page tab and the OAuth tab:
opening/focusing/closing the backup page, launching it as a silent background tab,
finding an already-open backup tab, and closing the OAuth tab after capture.
Call sites: `sw.ts`, `oauth.ts`.

**Why fewer isn't possible.** Note that `tabs.create` / `update` / `remove` / `get` do
**not** require this permission. The single call that does is
`chrome.tabs.query({ url })` in `sw.ts`, used to locate an existing backup tab so the
extension never opens duplicates (singleton behaviour). Filtering `tabs.query` by URL
requires either `tabs` or a host permission covering that URL. The extension
deliberately scopes its tab access to its **own** extension page
(`chrome.runtime.getURL(...)`) and the Blipfoto OAuth tab it opened itself — it never
reads, queries, or injects into arbitrary user tabs.

> _Reduction candidate:_ this permission could be removed by tracking the backup tab's
> ID in storage and replacing the URL query with `tabs.get(id)`.

### `webRequest`

**What it's used for.** Capturing the OAuth access token at the end of the Blipfoto
sign-in flow. The extension registers a single non-blocking
`chrome.webRequest.onBeforeRedirect` listener, filtered to `https://*.blipfoto.com/*`,
and acts only when Blipfoto issues the final 302 redirect to the custom scheme
`bark-chrome://oauth/callback`.
Call site: `oauth.ts`.

**Why fewer isn't possible.** Blipfoto uses the OAuth 2.0 **implicit grant** for
distributed apps: the access token is returned in the URL **fragment** of a redirect to
a custom scheme the browser cannot itself navigate to. `onBeforeRedirect` is the only
mechanism that reliably surfaces that redirect target _with its fragment intact_ before
the browser drops it. The listener is **observational only** (not `webRequestBlocking`)
— it never blocks, modifies, or inspects any other traffic — and is host-scoped to
`*.blipfoto.com`, so it cannot see requests to any other site. It is added only for the
duration of a sign-in attempt and removed on capture or 120s timeout.

**Why `chrome.identity.launchWebAuthFlow` cannot replace this.** The standard MV3
alternative (`chrome.identity.launchWebAuthFlow`) requires a
`https://<id>.chromiumapp.org/` redirect URI. This is **architecturally incompatible**
with Blipfoto's OAuth implementation: Blipfoto's server-side implicit grant handler
(`ImplicitGrant.php`) explicitly rejects any redirect URI beginning with `http://` or
`https://`, enforcing that distributed apps must use a custom (non-HTTP) scheme. This
is not a configuration choice — it is enforced at the protocol-validation layer and
cannot be overridden by registering an additional redirect URI. Blipfoto is a
community-owned, volunteer-run platform with no engineering resource available to
change its OAuth implementation. The `bark-chrome://` custom scheme is therefore the
only viable redirect target, and `webRequest` is the only API that can reliably capture
the token fragment from that redirect.

### `webNavigation`

**What it's used for.** A fallback for the same OAuth capture. A single
`chrome.webNavigation.onBeforeNavigate` listener, filtered to the `bark-chrome` scheme,
catches the custom-scheme navigation if the `webRequest` path misses it on certain
Chrome versions.
Call site: `oauth.ts`.

**Why fewer isn't possible.** The two listeners are belt-and-braces for a flow that only
runs during explicit user sign-in; in practice some Chrome versions deliver the
custom-scheme target via one event and not the other. The filter restricts it to the
`bark-chrome` scheme only, so it observes no normal web navigation. It is added and
removed alongside the `webRequest` listener and never persists.

---

## `host_permissions`

### `https://api.blipfoto.com/*`

**What it's used for.** The Blipfoto REST API client (`b-api/client.ts`) that lists and
downloads the user's journal entries and metadata — the core backup function.
**Why fewer isn't possible.** This is the single API origin the product is built around;
it cannot be narrowed further than the one host.

### `https://*.blipfoto.com/*`

**What it's used for.** Three things: (1) the declared content scripts — the status chip
(`chip-entry.ts`) and the publish watcher (`publish-watch.ts`) — which run on Blipfoto
pages; (2) the `webRequest` OAuth-redirect filter (`oauth.ts`); (3) cross-origin fetch
of the user's own avatar/profile image (`BrowserBackend.ts`). The OAuth authorize page
itself is on `www.blipfoto.com`.
**Why fewer isn't possible.** Blipfoto serves pages and assets across multiple
subdomains, so the access must cover `*.blipfoto.com` rather than a single host. It is
restricted to the one registrable domain the extension targets and grants no access to
any other site.

### `https://*.cloudfront.net/*`

**What it's used for.** Downloading the user's entry images and avatar bytes for all
versioned image sizes (thumbnail, lores, stdres, hires), which Blipfoto serves from
Amazon CloudFront CDN, so they can be written into the local backup folder
(`BrowserBackend.ts` and the backup engine's image fetches).

**Why fewer isn't possible.** Image backup is a primary feature. Analysis of Blipfoto's
server-side code establishes why the wildcard cannot be narrowed to specific hostnames:

- Blipfoto maintains **separate CloudFront distributions per image version** (one
  distribution each for thumbnail, lores, stdres, hires). Each distribution has its own
  AWS-generated hostname (e.g. `dXXXX.cloudfront.net`).
- These hostnames are **generated by AWS at distribution-creation time** and stored in
  private server-side configuration (`conf.json`) that is pulled from a private S3
  bucket at instance boot. They are not derived from any algorithm in the code and are
  not guessable or embeddable by a client.
- The only reliable source of truth is the **live API response**: image URLs returned
  by the Blipfoto API already contain the correct live hostname, and the extension reads
  the host from those URLs at runtime.
- Pinning specific `dXXXX.cloudfront.net` hostnames would therefore hardcode values
  that could change on any Blipfoto infrastructure update (e.g. distribution recreation),
  breaking the extension for all users. Blipfoto is a community-owned, volunteer-run
  platform with no engineering resource to provide or maintain a stable, documented CDN
  hostname for client use.

The wildcard is the minimum viable scope given these constraints. The permission grants
read access only to image URLs the Blipfoto API itself supplies; the extension makes no
speculative requests to CloudFront.

### `https://*.amazonaws.com/*`

**What it's used for.** Downloading **original-resolution** images. Blipfoto serves
originals differently from other versions: rather than a stable CDN URL, the API
returns a **time-limited AWS S3 presigned URL** (expiring in approximately 10 minutes)
pointing directly to the S3 bucket in the `eu-west-1` region
(e.g. `https://s3.eu-west-1.amazonaws.com/...`). The extension must fetch these URLs
promptly after receiving them from the API in order to write the original-resolution
file into the backup folder.

**Why fewer isn't possible.** Originals are served via presigned S3 URLs, not via
CloudFront, so `*.cloudfront.net` does not cover them. The presigned URL includes a
region-specific S3 hostname; while `s3.eu-west-1.amazonaws.com` is the current
observed host, S3 endpoint formats can include path-style and virtual-hosted-style
variants. Blipfoto is a community-owned, volunteer-run platform with no resource to
document or stabilise the S3 endpoint format for client use. The `*.amazonaws.com`
wildcard is therefore required to reliably reach original-resolution files regardless
of S3 endpoint variant. The extension only fetches URLs supplied directly by the
Blipfoto API; it makes no speculative requests to AWS infrastructure.

---

## Summary table (for the submission form)

| Permission           | One-line justification                                                                                                                                                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`            | Cross-context (worker/chip/page) shared state + encrypted token at rest, with `onChanged` events no other API provides.                                                                                                                                                                                                         |
| `tabs`               | Singleton management of the extension's own backup page via `tabs.query({url})`; never touches arbitrary user tabs.                                                                                                                                                                                                             |
| `webRequest`         | Non-blocking, `*.blipfoto.com`-scoped capture of the implicit-grant OAuth token from the custom-scheme redirect fragment. `chrome.identity.launchWebAuthFlow` is architecturally incompatible: Blipfoto's server enforces non-HTTP schemes for distributed apps and cannot be changed (community-run, no engineering resource). |
| `webNavigation`      | `bark-chrome`-scheme-scoped fallback for the same OAuth capture on Chrome versions where `webRequest` misses it.                                                                                                                                                                                                                |
| `api.blipfoto.com/*` | The Blipfoto REST API — lists/downloads the user's journal.                                                                                                                                                                                                                                                                     |
| `*.blipfoto.com/*`   | Content-script chip + publish watcher, OAuth redirect filter, avatar fetch.                                                                                                                                                                                                                                                     |
| `*.cloudfront.net/*` | Downloads versioned entry images (thumbnail/lores/stdres/hires) served from Blipfoto's CloudFront CDN. Multiple distributions, one per image version; hostnames are AWS-generated, stored in private server-side config, and only known at runtime from API response URLs — cannot be hardcoded.                                |
| `*.amazonaws.com/*`  | Downloads original-resolution images served as time-limited S3 presigned URLs (not via CloudFront). Only fetches URLs supplied by the Blipfoto API.                                                                                                                                                                             |
