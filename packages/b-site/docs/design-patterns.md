# b-site design patterns

How the b-oss website is built, so that new pages and sections reuse what is already here. Written
for the relaunch ([b-oss#837](https://github.com/IanMStevenson/b-oss/issues/837)); correct it if it
disagrees with the site. Status: first draft from reading the pages, not yet confirmed by Ian.

**The rule:** build new pages and sections from the pieces below. Add a new piece only when none fits,
and say why in the PR. No page-local styling (`style="..."`) for anything that could be a shared piece.

## Page recipes

### Product page (b-ark, b-api; b-mobile needs checking against this)

This is the **target recipe**, not a description of every page today. Known differences on the
integration branch: `b-ark` styles its per-variant "Get it" labels inline, and `b-api` has no contact
band and titles its section "Get b-api". Bring them in line when those pages are next touched.

1. **Hero** (`Hero.astro`): big icon, product name as `h1`, one-line lead.
2. **Introduction** (`section.block`, eyebrow "Introduction"): a short `prose` paragraph and a
   `feature-list` of 4 ticks, each a bold lead word and one sentence (`FeatureItem`).
3. **Screenshot** (`.shot`): one image, centred, `max-width: 520px`.
4. *(b-ark only)* a "which one?" comparison section, linking to `b-ark-versions`.
5. **Get it** (`section.block#download`, eyebrow "Get it"): rows of **tri-link cards** (see below), one
   row per product variant, each with a small eyebrow label ("b-ark · Windows desktop").
6. **CtaBand**: "Contact us with feedback, suggestions and bugs." (Not on b-mobile yet.)

The "Get it" cards are the page's calls to action and always come last. Nothing about getting the
product is above the fold except the page's own navigation.

### Homepage

Hero, a one-paragraph About, then one **app-card** per product: icon, name, tagline, summary,
optional ticks, a "Learn more" button, and a screenshot beside it.

### Guide pages (b-ark-guide, b-ark-chrome-guide, b-mobile-guide)

Hero, a contents list (`.toc`), then numbered steps (`<ol>`) with lightbox screenshots
(`PhoneShots` for b-mobile) and tables. Pass `lightbox` to `Layout`.

### Utility pages (about, contact, privacy, data deletion)

Hero and one or two `prose` blocks. Contact has the form; the privacy pages are plain prose.

### Status page

Its own styling, every class prefixed `st-`; see [`status-page.md`](status-page.md). Do not reuse
`st-` classes elsewhere and do not restyle them.

## Pieces

| Piece | Where | Use |
|---|---|---|
| Hero | `components/Hero.astro` | Top of every page. Icon optional. |
| Eyebrow | `.section-eyebrow` | Small uppercase label that opens a `section.block`. |
| Prose | `.prose` | Running text; links underlined. |
| Feature ticks | `.feature-list` + `FeatureItem` | 3 to 6 short points. |
| Screenshot | `.shot` | One framed image. |
| Phone shots | `PhoneShots.astro` | Row of captioned phone screenshots (centred). |
| Tri-link card | `.tri-links` > `.tri-link` | Icon (or store badge), `h3`, one-line `p`. Three per row, centred; a row with fewer cards centres. The whole card is the link. |
| App card | `.app-card` | Homepage product block. |
| Store badge (arrives with [b-oss#850](https://github.com/IanMStevenson/b-oss/pull/850)) | `StoreBadge.astro`, `src/stores.ts` | Official badge artwork, unmodified, linking to a live listing; a black, plain-text "coming soon" box when not live. Used inside a tri-link card with `bare`. |
| Button | `.btn`, `.btn.primary` | One primary action per block. |
| Contact band | `CtaBand.astro` | Last thing before the footer. |
| Header, footer | `Header.astro`, `Footer.astro` | Nav and footer links are defined once, there. |

Design tokens (colours, radius, shadow) are CSS custom properties at the top of `public/site.css`.
Narrow screens: layouts collapse at 820px, 640px and 520px; check a phone width before presenting.

## Content conventions

- Aimed at non-technical readers who know Blipfoto. Short sentences, no jargon, no history.
- Names are lowercase and hyphenated: b-ark, b-mobile, b-oss. "Blipfoto" is capitalised in running
  text (older headings still say "blipfoto"; fix when touching them, do not hunt for them).
- Don't promise what isn't live. A store that isn't live shows "coming soon"; flipping it live is a
  one-line change in `src/stores.ts`.
- Existing URLs never change (they are linked from the stores and the apps). See the README.

## Products and how they relate

| Product | What it is | Stores |
|---|---|---|
| b-mobile | Blipfoto app for Android; b-mobile-pc is the same product for Windows, same features as far as the platform allows | Google Play; Microsoft Store (coming) |
| b-ark | Backup and archive, Windows desktop app | Microsoft Store (coming); legacy installer on GitHub, no longer linked |
| b-ark-chrome | Backup and archive as a Chrome extension. A different but related product to b-ark (different features), not a second form of the same one | Chrome Web Store |
| b-status | The unofficial Blipfoto status page | none; lives on the site |
| b-api | TypeScript client for the Blipfoto API, for developers | none; GitHub |

Infrastructure that stays easy to reach: contact form, privacy policies, b-status, and the repo
(for co-developers).

## Open questions

- b-mobile: it has not had the contact band or the intro-plus-screenshot-plus-Get-it rhythm; is
  the recipe above right for it, or does it want something of its own?
- Homepage: how b-ark-chrome, b-status and the developer links (repo, b-api) fit the app-card
  pattern. Being worked in the homepage proposal ([b-oss#839](https://github.com/IanMStevenson/b-oss/issues/839)).
