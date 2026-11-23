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
- **`pages`**: the scripts that drive the site's own pages in a hidden browser page (adding, removing
  and reading extra photos, the remaining allowance, a page's HTML), their result types, and the
  member guard: every script is built for one member and refuses unless the page says exactly that
  member is signed in.

## Rules

- No `electron`, `chrome.*`, `@capacitor/*` or Node imports; no platform code at all. Hosts (the
  windows and cookie stores that load a page) and app policy (gates, dialogs, mapping a URL to a
  route) live outside it. The contract between common code and a host is in b-mobile
  (`src/site/contract.ts`, `docs/ImplementationSpec/site-session.md`).
- `b-api` never depends on it; apps and `backup-engine` may.
- The extras scraper and gallery parsing still live in `b-api` (`entry-extras.ts`, `gallery.ts`)
  because `backup-engine` uses them; they move here with that dependency
  ([b-oss#1049](https://github.com/IanMStevenson/b-oss/issues/1049)).

Design: [b-oss#1046](https://github.com/IanMStevenson/b-oss/issues/1046), epic
[b-oss#1043](https://github.com/IanMStevenson/b-oss/issues/1043).
