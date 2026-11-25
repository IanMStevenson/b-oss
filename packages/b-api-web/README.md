# b-api-web

The website-only bits of Blipfoto: what the JSON API ([b-api](../b-api)) does not cover, and the
knowledge of how the site's pages work, in one place so no app keeps its own copy.

`b-api` stays the JSON API and OAuth only. This package is not a general wrapper of the website:
only the pieces an app needs and the API lacks.

## What is here

- **`urls`**: the site's origin and the URLs an app builds or links to (an entry, its edit page, a
  profile, sign-in, the legal pages, the icon base).
- **`parse`**: the inverse. `parseSiteUrl(href)` says what a site link points at (an entry, a profile,
  the follow-requests page), so the grammar exists once; apps map the result to their own routes.
- **`session`**: what a website session looks like from outside: the cookie domain and session cookie
  name, the stored cookie shape (`WebCookie`) and its (de)serialisation, sign-in detection
  (`isLoginUrl`, `looksLikeLoginPage`, `isSignedInFromCookies`, `classifyScrapeResponse`). One fact
  to know: **the signed-out site also sets `BLIPFOTO_SESSION`** (an anonymous session), so the
  cookie's presence proves nothing; the sign-in form's absence, or the page naming the member, does.
  The site is a plain Apache/PHP stack with no Cloudflare. Learned from b-ark's per-account session.
- **`gallery`** and **`entry-extras`**: reading a public entry page. `extractGalleryItems(html)` pulls the
  gallery blob out of the page; `fetchEntryExtras(entryId, fetchText)` turns it into an entry's extra
  photos (or says the journal is protected). Both take page text, never fetch it themselves: the
  transport is the host's (`PlatformIO.fetchHtml` in `backup-engine`, `siteText` in b-mobile).
  `resolveSiteUrl` makes the site's relative image paths absolute.
- **`pages`**: the scripts that drive the site's own pages in a hidden browser page (adding, removing
  and reading extra photos, the remaining allowance, a page's HTML), their result types, and the
  member guard: every script is built for one member and refuses unless the page says exactly that
  member is signed in.

## Rules

- No `electron`, `chrome.*`, `@capacitor/*` or Node imports; no platform code at all. Hosts (the
  windows and cookie stores that load a page) and app policy (gates, dialogs, mapping a URL to a
  route) live outside it. The contract between common code and a host is in b-mobile
  (`src/site/contract.ts`, `docs/ImplementationSpec/site-session.md`).
- `b-api` never depends on it; apps and `backup-engine` may (`backup-engine` takes its site URLs and
  page parsing from here).

Design: [b-oss#1046](https://github.com/IanMStevenson/b-oss/issues/1046), epic
[b-oss#1043](https://github.com/IanMStevenson/b-oss/issues/1043).
