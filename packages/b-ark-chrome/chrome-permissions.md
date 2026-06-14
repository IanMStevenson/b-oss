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
`backup_lifecycle`, `backup_on_publish`), the single backup-tab tracking and cross-tab
guards (`backup_tab_id`, `backup_lock`, `settings_lock`), OAuth progress (`oauthStatus`),
and the **AES-GCM-encrypted** OAuth token (`tokenCiphertext` / `tokenIv` — the
non-extractable CryptoKey itself lives in IndexedDB, never in storage).
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

### `webRequest`

**What it's used for.** Capturing the OAuth access token at the end of the Blipfoto
sign-in flow. The extension registers a single non-blocking
`chrome.webRequest.onBeforeRedirect` listener, filtered to `https://*.blipfoto.com/*`,
and acts only when Blipfoto issues the final 302 redirect to the custom scheme
`bark-chrome://oauth/callback`.
Call site: `oauth.ts`.

**Why fewer isn't possible.** Blipfoto uses the OAuth 2.0 **implicit grant** for
distributed apps: the access token is returned in the URL **fragment** of a redirect to
a custom scheme the browser cannot itself navigate to. `onBeforeRedirect` is the **sole**
capture mechanism: it fires on the HTTP 302 response at the network layer and surfaces
that redirect target _with its fragment intact_ before the browser attempts the
unhandled custom-scheme navigation. The listener
is **observational only** (not `webRequestBlocking`) — it never blocks, modifies, or
inspects any other traffic — and is host-scoped to `*.blipfoto.com`, so it cannot see
requests to any other site. It is added only for the duration of a sign-in attempt and
removed on capture or 120s timeout.

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

### `https://s3.eu-west-1.amazonaws.com/*`

**What it's used for.** Downloading **original-resolution** images. Blipfoto serves
originals differently from other image versions: rather than a CloudFront CDN URL, the
API returns a **time-limited AWS S3 presigned URL** (expiring in approximately 10
minutes) pointing directly to the S3 bucket. Server-side code analysis identifies the
endpoint as `s3.eu-west-1.amazonaws.com` — Blipfoto's infrastructure operates entirely
in the `eu-west-1` region. The extension fetches these URLs promptly after receiving
them from the API in order to write the original-resolution file into the backup folder.

**Why fewer isn't possible.** Originals are served via presigned S3 URLs, not via
CloudFront, so `\*.cloudfront.net` does not cover them. As with the CloudFront URLs, no
S3 URLs are embedded in the extension source — they are returned at runtime by the
Blipfoto API, which constructs them from private server-side configuration. The
permission is scoped to the single, specific regional endpoint identified by that
analysis; the extension makes no speculative requests to AWS infrastructure and only
fetches URLs supplied directly by the Blipfoto API.

---

## Summary table (for the submission form)

| Permission                                 | One-line justification                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                  | Cross-context (worker/chip/page) shared state + encrypted token at rest, with `onChanged` events no other API provides.                                                                                                                                                                                                                                              |
| `webRequest`                               | Non-blocking, `*.blipfoto.com`-scoped capture of the implicit-grant OAuth token from the custom-scheme redirect fragment — the sole, proven capture mechanism. `chrome.identity.launchWebAuthFlow` is architecturally incompatible: Blipfoto's server enforces non-HTTP schemes for distributed apps and cannot be changed (community-run, no engineering resource). |
| `api.blipfoto.com/*`                       | The Blipfoto REST API — lists/downloads the user's journal.                                                                                                                                                                                                                                                                                                          |
| `*.blipfoto.com/*`                         | Content-script chip + publish watcher, OAuth redirect filter, avatar fetch.                                                                                                                                                                                                                                                                                          |
| `*.cloudfront.net/*`                       | Downloads versioned entry images (thumbnail/lores/stdres/hires) served from Blipfoto's CloudFront CDN. Multiple distributions, one per image version; hostnames are AWS-generated, stored in private server-side config, and only known at runtime from API response URLs — cannot be hardcoded.                                                                     |
| `### https://s3.eu-west-1.amazonaws.com/*` | Downloads original-resolution images served as time-limited S3 presigned URLs (not via CloudFront). Only fetches URLs supplied by the Blipfoto API.                                                                                                                                                                                                                  |
