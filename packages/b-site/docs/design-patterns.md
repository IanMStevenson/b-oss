# b-site design patterns

How the b-oss website is built, so that new pages and sections reuse what is already here. Written
for the relaunch ([b-oss#837](https://github.com/IanMStevenson/b-oss/issues/837)); correct it if it
disagrees with the site. Status: first draft from reading the pages, not yet confirmed by Ian.

**The rule:** build new pages and sections from the pieces below. Add a new piece only when none fits,
and say why in the PR. No page-local styling (`style="..."`) for anything that could be a shared piece.

## Page recipes

### Product page (b-ark, b-api, b-mobile)

`b-mobile` is the exemplar: build new product pages like it. Follow-ups, not current work:

- **`b-ark`:** 4 ticks rather than 6; one `.shot` rather than `PhoneShots`; a comparison section in place of
  the plain facts.
- **`b-api`:** one `.shot`; no plain facts; no privacy buttons, as it is a code library, not an app.

Product pages have **no eyebrow labels**. Sections sit in a `.bands` wrapper, alternating `.band-tint` and
white, starting tinted under the white hero.

1. **Hero** (`Hero.astro`): the b-oss icon on the left, `h1` as "name - what it is" ("b-ark - backup for
   Blipfoto"), and a one-line lead (on desktop) that says what the thing does for a non-technical reader,
   never what is on the page.
2. **Introduction** (`section.block`): a short `prose` paragraph and a
   `feature-list` of ticks, each a bold lead word and one sentence (`FeatureItem`).
3. **Screenshots** (`section.block`): `PhoneShots`, without captions.
4. **Good to know** (`section.block`): plain facts a reader should have before
   installing.
5. **Get it** (`section.block#download`): one `div.tri-link` card per store or product,
   side by side: store badge, name, one line. Each product card carries its own "User guide" link.
6. **CtaBand**: "Contact us with feedback, suggestions and bugs." Every product page has it.
7. **Privacy buttons**: a centred `.btn-row` of plain buttons under the band, no heading, labels that say what
   they are ("b-mobile privacy policy", "Delete your b-mobile data").

The "Get it" cards are the page's calls to action and come last apart from the band and privacy buttons. Nothing about getting the
product is above the fold except the page's own navigation. This is for product pages only; the
homepage is the showcase and carries store badges in its app-cards.

Product pages' "Get it" cards hold the store badge, then "User guide · What's new" on one line. The source-code card appears only on
`b-api`; elsewhere open source is at most a mention.

`b-ark` is the family page for b-ark and b-ark-chrome: it holds their comparison and a "Get it" row for
each. b-ark-chrome has no page of its own, so its "Learn more" links go to `b-ark`. `b-ark-versions` is
the detailed comparison, linked by a button from `b-ark`; its table ends in a row of store badges, with no
app-cards.

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
5. **CtaBand** for contact, as its own white band. Privacy is reached from the footer.

Items 2 to 5 sit in a `.bands` wrapper: no divider lines, and strict alternation of `.band-tint` and white,
starting tinted under the white hero. On the homepage contact is a band too; product pages keep the contact card.

### What's new pages (`[product]-whats-new.astro`)

One page per product from the root `CHANGELOG.md`, read at build time: Hero "What's new in <product>", then a
band per release (no eyebrows), then the contact card. Only entries tagged for that product appear; `internal:`,
other packages and untagged entries don't. A product with no tagged entries has no page or link, which is how
b-mobile-pc waits for its first release. Not in the footer or top nav.

### Guide pages (b-ark-guide, b-ark-chrome-guide, b-mobile-guide)

Hero, a contents list (`.toc`), then numbered steps (`<ol>`) with lightbox screenshots
(`PhoneShots` for b-mobile) and tables. Pass `lightbox` to `Layout`.

### Utility pages (about, contact, privacy, data deletion)

Hero and one or two `prose` blocks. About keeps its eyebrow labels. Contact has the form; the privacy pages are plain prose.

`how-this-works` belongs with the status page and uses its own `hw-` classes.

### Status page

Its own styling, every class prefixed `st-`; see [`status-page.md`](status-page.md). Do not reuse
`st-` classes elsewhere and do not restyle them.

## Pieces

| Piece | Where | Use |
|---|---|---|
| Hero | `components/Hero.astro` | Top of every page except Status and How this works. Text left-aligned. Icon optional, on the homepage, product pages, about and the compare page: the `icon` prop is its alt text, and the image is always the b-oss icon. It sits left of the text, and beside the heading only on narrow screens. |
| Eyebrow | `.section-eyebrow` | Small uppercase label that opens a `section.block`. Used on About and guides, not on product pages. |
| Prose | `.prose` | Running text; links underlined. |
| Feature ticks | `.feature-list` + `FeatureItem` | 3 to 6 short points. |
| Two columns | `.two-col` | Side-by-side text that stacks on narrow screens. |
| Screenshot | `.shot`, `.shot-center` | One framed image, cropped to 16:10; `.shot-center` centres it at up to 520px. |
| Phone shots | `PhoneShots.astro` | Row of phone screenshots (centred). Captions are optional. |
| Tri-link card | `.tri-links` > `.tri-link` | Icon (or store badge), `h3`, one-line `p`. Three per row, centred; a row with fewer cards centres. Either the whole card is the link (`a.tri-link`), or it is a `div.tri-link` with links inside. |
| App card | `.app-card` | Product block on the homepage. |
| Store badge | `StoreBadge.astro`, `src/stores.ts` | Official badge artwork, unmodified, linking to a live listing; a black, plain-text "coming soon" box when not live. Two forms: `bare` inside a tri-link card (the card is the link), or linked by itself in a `.store-badges` row inside an app-card. |
| Tinted band | `.bands`, `.band-tint` | Homepage and product-page sections: full-width tint from design tokens, no markup outside the page column. A `CtaBand` directly inside drops its own box. |
| Button | `.btn`, `.btn.primary`, `.btn-row`, `.btn-row-center` | One primary action per block. A store badge counts as the primary action, so "Learn more" beside one is a plain `.btn`, even while the badge says "coming soon". |
| Band | `CtaBand.astro` | One line and one button. With no props it is the contact band, the last thing before the footer. Slot text plus `href` and `label` point it elsewhere (b-status on the homepage). |
| Header, footer | `Header.astro`, `Footer.astro` | Nav and footer links are defined once, there. Nav: Home, b-ark, b-mobile, b-api, Status, About, Contact. Footer: About, Status, Privacy, GitHub, Contact. |

Design tokens (colours, radius, shadow) are CSS custom properties at the top of `public/site.css`.
Narrow screens: layouts collapse at 820px, 720px, 640px, 520px and 420px; check a phone width before presenting.

## Content conventions

- Aimed at non-technical readers who know Blipfoto. Short sentences, no jargon, no history.
- Product names are lowercase and hyphenated: b-ark, b-mobile, b-oss. "Blipfoto" is always
  capitalised (the status page and guides are being brought in line separately). `scripts/check-case.mjs` fails
  the build on lowercase "blipfoto" in a page's rendered text; URLs and code are ignored.
- Don't promise what isn't live. A store that isn't live shows "coming soon"; flipping it live is a
  one-line change in `src/stores.ts`.
- Existing URLs never change (they are linked from the stores and the apps). See the README.

## Products and how they relate

| Product | What it is | Stores |
|---|---|---|
| b-mobile | The Blipfoto app for Android; b-mobile-pc is the same product for Windows, same features as far as the platform allows | Google Play; Microsoft Store (coming) |
| b-ark | Backup and archive, Windows desktop app | Microsoft Store (coming), the only route. Legacy installers stay on GitHub, not linked from the site |
| b-ark-chrome | Backup and archive as a Chrome extension. A different but related product to b-ark (different features), not a second form of the same one | Chrome Web Store |
| b-status | The unofficial Blipfoto status page | none; lives on the site |
| b-api | TypeScript client for the Blipfoto API, for developers | none; GitHub |

Infrastructure that stays easy to reach: contact form, privacy policies, b-status, and the repo
(for co-developers).
