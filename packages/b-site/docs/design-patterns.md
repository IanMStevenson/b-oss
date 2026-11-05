# b-site design patterns

How the b-oss website is built, so that new pages and sections reuse what is already here. Written
for the relaunch ([b-oss#837](https://github.com/IanMStevenson/b-oss/issues/837)); correct it if it
disagrees with the site. Status: first draft from reading the pages, not yet confirmed by Ian.

**The rule:** build new pages and sections from the pieces below. Add a new piece only when none fits,
and say why in the PR. No page-local styling (`style="..."`) for anything that could be a shared piece.

## Page recipes

### Product page (b-ark, b-api, b-mobile)

`b-mobile` is the exemplar: build new product pages like it. Follow-ups, not current work:

- **`b-ark`:** 4 ticks rather than 6; one `.shot` in an inline-styled wrapper rather than `PhoneShots`; a
  comparison section in place of "Good to know"; inline-styled "Get it" row labels.
- **`b-api`:** the same inline-styled `.shot` wrapper; no "Good to know"; its section says "Get b-api"
  rather than "Get it"; no privacy buttons, as it is a code library, not an app.

1. **Hero** (`Hero.astro`): the b-oss icon on the left, `h1` as "name - what it is" ("b-ark - backup for
   blipfoto"), and a one-line lead (on desktop) that says what the thing does for a non-technical reader,
   never what is on the page.
2. **Introduction** (`section.block`, eyebrow "Introduction"): a short `prose` paragraph and a
   `feature-list` of ticks, each a bold lead word and one sentence (`FeatureItem`).
3. **Screenshots** (`section.block`, eyebrow "Screenshots"): `PhoneShots`.
4. **Good to know** (`section.block`, eyebrow "Good to know"): plain facts a reader should have before
   installing.
5. **Get it** (`section.block#download`, eyebrow "Get it"): rows of **tri-link cards** (see below), one
   row per product, each with a small eyebrow label ("b-ark · Windows desktop").
6. **CtaBand**: "Contact us with feedback, suggestions and bugs." Every product page has it.
7. **Privacy buttons**: a `.btn-row` of plain buttons under the band, no heading, labels that say what
   they are ("b-mobile privacy policy", "Delete your b-mobile data").

The "Get it" cards are the page's calls to action and come last apart from the band and privacy buttons. Nothing about getting the
product is above the fold except the page's own navigation. This is for product pages only; the
homepage is the showcase and carries store badges in its app-cards.

Product pages' "Get it" rows hold store cards and the user guide. The source-code card appears only on
`b-api`; elsewhere open source is at most a mention.

`b-ark` is the family page for b-ark and b-ark-chrome: it holds their comparison and a "Get it" row for
each. b-ark-chrome has no page of its own, so its "Learn more" links go to `b-ark`. `b-ark-versions` is
the detailed comparison, linked from `b-ark`.

### Homepage

A showcase of what's here, in this order:

1. **Hero**: what b-oss offers, in one sentence.
2. One **app-card** per app, b-mobile (tinted), b-ark, then b-ark-chrome (tinted): icon, name, tagline, a short summary
   with no ticks, a `.store-badges` row, a plain "Learn more" button, and screenshots beside it.
   b-mobile-pc is a second badge on the b-mobile card, because it is the same product. Comparing the
   backups is left to the `b-ark` page.
3. **CtaBand** for b-status, as its own white band. It has no store, and a screenshot would freeze
   "working" on the page.
4. **Open source and developers** (tinted `section.block`): a `prose` paragraph with no heading or cards,
   linking the repo and b-api.
5. **CtaBand** for contact, then a privacy button under it, as on product pages.

Items 2 to 4 sit in a `.bands` wrapper: no divider lines, and strict alternation of `.band-tint` and white,
starting tinted under the white hero. This is the homepage only; other pages keep the thin dividers.

### Guide pages (b-ark-guide, b-ark-chrome-guide, b-mobile-guide)

Hero, a contents list (`.toc`), then numbered steps (`<ol>`) with lightbox screenshots
(`PhoneShots` for b-mobile) and tables. Pass `lightbox` to `Layout`.

### Utility pages (about, contact, privacy, data deletion)

Hero and one or two `prose` blocks. Contact has the form; the privacy pages are plain prose.

`how-this-works` belongs with the status page and uses its own `hw-` classes.

### Status page

Its own styling, every class prefixed `st-`; see [`status-page.md`](status-page.md). Do not reuse
`st-` classes elsewhere and do not restyle them.

## Pieces

| Piece | Where | Use |
|---|---|---|
| Hero | `components/Hero.astro` | Top of every page except Status and How this works. Text left-aligned. Icon optional, on the homepage, product pages, about and the compare page: the `icon` prop is its alt text, and the image is always the b-oss icon. It sits left of the text, and beside the heading only on narrow screens. |
| Eyebrow | `.section-eyebrow` | Small uppercase label that opens a `section.block`. |
| Prose | `.prose` | Running text; links underlined. |
| Feature ticks | `.feature-list` + `FeatureItem` | 3 to 6 short points. |
| Screenshot | `.shot` | One framed image, cropped to 16:10. |
| Phone shots | `PhoneShots.astro` | Row of captioned phone screenshots (centred). |
| Tri-link card | `.tri-links` > `.tri-link` | Icon (or store badge), `h3`, one-line `p`. Three per row, centred; a row with fewer cards centres. The whole card is the link. |
| App card | `.app-card` | Product block on the homepage and `b-ark-versions`. |
| Store badge | `StoreBadge.astro`, `src/stores.ts` | Official badge artwork, unmodified, linking to a live listing; a black, plain-text "coming soon" box when not live. Two forms: `bare` inside a tri-link card (the card is the link), or linked by itself in a `.store-badges` row inside an app-card. |
| Tinted band | `.bands`, `.band-tint` | Homepage sections: full-width tint from design tokens, no markup outside the page column. A `CtaBand` directly inside drops its own box. |
| Button | `.btn`, `.btn.primary` | One primary action per block. A store badge counts as the primary action, so "Learn more" beside one is a plain `.btn`, even while the badge says "coming soon". |
| Band | `CtaBand.astro` | One line and one button. With no props it is the contact band, the last thing before the footer. Slot text plus `href` and `label` point it elsewhere (b-status on the homepage). |
| Header, footer | `Header.astro`, `Footer.astro` | Nav and footer links are defined once, there. Nav: Home, b-ark, b-mobile, b-api, Status, About, Contact. Footer: About, Status, Privacy, GitHub, Contact. |

Design tokens (colours, radius, shadow) are CSS custom properties at the top of `public/site.css`.
Narrow screens: layouts collapse at 820px, 720px, 640px, 520px and 420px; check a phone width before presenting.

## Content conventions

- Aimed at non-technical readers who know blipfoto. Short sentences, no jargon, no history.
- Names are lowercase and hyphenated: b-ark, b-mobile, b-oss. So is "blipfoto", always; avoid
  starting a sentence with it. Older copy still says "Blipfoto" until a separate site-wide sweep.
- Don't promise what isn't live. A store that isn't live shows "coming soon"; flipping it live is a
  one-line change in `src/stores.ts`.
- Existing URLs never change (they are linked from the stores and the apps). See the README.

## Products and how they relate

| Product | What it is | Stores |
|---|---|---|
| b-mobile | The blipfoto app for Android; b-mobile-pc is the same product for Windows, same features as far as the platform allows | Google Play; Microsoft Store (coming) |
| b-ark | Backup and archive, Windows desktop app | Microsoft Store (coming), the only route. Legacy installers stay on GitHub, not linked from the site |
| b-ark-chrome | Backup and archive as a Chrome extension. A different but related product to b-ark (different features), not a second form of the same one | Chrome Web Store |
| b-status | The unofficial blipfoto status page | none; lives on the site |
| b-api | TypeScript client for the blipfoto API, for developers | none; GitHub |

Infrastructure that stays easy to reach: contact form, privacy policies, b-status, and the repo
(for co-developers).
