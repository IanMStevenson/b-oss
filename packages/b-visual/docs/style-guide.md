# b-oss visual style guide

The written conventions behind `tokens.css`/`tokens.ts` — how the values are actually used across
`b-view` and `b-ark-ui-electron`, the two existing consumers, so a new UI (`b-mobile`) can match
the established look rather than reinvent it. There was no prior style-guide document; this one
was written by reading those packages' CSS, not migrated from somewhere else.

Tokens only cover colour/type/spacing primitives. The sections below (header bar, iconography,
layout hierarchy, photo-forward content) describe the higher-level conventions those primitives
are assembled into — read from the shipped screenshots in `docs/assets/` (`b-ark-screenshot.png`,
`docs/assets/guide/*`, `docs/assets/guide-chrome/*`) rather than from any written spec, since none
existed before this document either. b-oss's visual identity draws on blipfoto.com's own
dark-header, photo-led browsing style, deliberately simplified: these are single-purpose backup/
viewer utilities, not a social destination, so the chrome is pared back to a fraction of what
blipfoto.com itself carries in its nav bar.

## Colour

- **`--ink` / `--ink-2`** — primary vs. secondary text. `--ink` for headings and the most
  important line of a block (an entry title, a comment author); `--ink-2` for body text and
  secondary labels sitting near it (nav headings, comment bodies, EXIF values).
- **`--muted` / `--muted-2`** — tertiary text and meta information (counts' labels, placeholder
  text, timestamps-equivalent captions). `--muted-2` is the quieter of the two — used for
  placeholder/icon colour where `--muted` would be too present.
- **`--line` / `--line-2`** — borders and dividers. `--line` for a border that should read as a
  real separator (section rules, input borders); `--line-2` for a subtler hairline (a controls-bar
  bottom border, a hover-state fill).
- **`--green-700` / `--green-800`** — the interactive/brand colour. `--green-700` is the resting
  link colour; `--green-800` is its hover/active/selected state (also used for a selected
  thumbnail's outline). Don't introduce a second brand hue — everything interactive routes through
  this pair.
- **`--green-100` / `--green-800`** — paired for tag-pill styling (light background, dark-green
  text) — the one place a light-tint/dark-text combination is used rather than ink-on-white.
  Reuse the pairing for anything else that reads as a small categorical chip.
- **`--bg` / `--bg-alt`** — page background vs. a recessed/placeholder surface (image
  placeholders, empty-state backgrounds).
- **`--photo-bg`** — specifically for letterboxing/constraining a photo that doesn't fill its
  container; don't reuse it as a general placeholder colour, use `--bg-alt` for that.
- **`--color-danger`** — the one semantic status colour in the base layer, for error text/states.
  It replaces what was `--rag-red` in `b-view`'s own CSS — RAG (backup status) is app-specific
  vocabulary and does not belong in a general-purpose UI kit's base palette; a consuming app that
  wants a full red/amber/green status triad defines its own layer on top (as `b-ark` already
  does for backup status).

## Header bar

Every b-oss surface — the `b-ark` desktop window, the `b-view` browser tab, the `b-ark-chrome`
popup — opens with a solid, full-width bar in `--green-800`, flush against the window/tab chrome
with no gap or shadow beneath it. It reads as part of the app's frame, not a card floating in the
page. Flat fill only — no gradient, no texture. It is the one place a saturated colour covers a
large area; everything below it drops to white/near-white.

Inside the bar there are at most three things, always in the same positions:

- **Left: the wordmark**, bold, ~14–16px, in white or the lightest tint — `b-ark`, `b-view`. Fixed
  regardless of screen, so it doubles as an orientation anchor.
- **Centre-left, immediately after it: contextual text** in a muted tint of the same green family
  (not white) — typically the connected journal's name (e.g. `cyclops`). This makes the bar double
  as a breadcrumb without competing with the wordmark for attention.
- **Right: at most one small icon** — an info-circle (`ⓘ`), thin white stroke, ~16px. That's the
  entire right-hand side.

Compare this to blipfoto.com's own dark nav bar, which is comparatively busy — Browse/Community/
Map/Add-Entry buttons, a search box, chat and notification icons, a rounded entry-count pill. b-oss
apps borrow the "dark, confident, full-width bar as the product's signature" move but strip it down
hard, because there's nowhere for a b-oss app to send you except the one screen you're already on.

## Iconography

Everything below the header — home, calendar/date, zoom out/percentage/zoom in, refresh, grid-view
toggle, list/doc-view toggle, gear (settings), info-circle — is a thin, single-stroke line icon, no
fill, ~16–18px, monochrome (`--ink`/`--muted` at rest, never green unless active/selected — see the
green-700/800 "everything interactive" rule under Colour). These sit in a horizontal rail next to
the journal/account name, functioning as a toolbar rather than tabs or a dropdown menu.

Icons in that rail never carry a text label — they're used consistently enough to be
self-explanatory. But the one primary, commit-style action on a given screen is always a labelled
button, never a bare icon: "Backup now", "Done", "Move folder…", "Sign in to Blipfoto". The split is
deliberate — icons for frequent, low-stakes, navigational actions; a filled green pill button for
the one action that actually does something.

## Type scale

No formal named scale — these are the sizes actually in use, smallest to largest, each tied to a
role rather than a free choice:

| Size | Role                                                                                 |
| ---- | ------------------------------------------------------------------------------------ |
| 12px | Small meta labels (zoom %, tag pills, EXIF row secondary text)                       |
| 13px | Body default (matches `global.css`'s base `font-size`); nav bar text; comment bodies |
| 14px | Slightly emphasised body text (entry description, empty-state message)               |
| 15px | A screen/section heading within a nav bar                                            |
| 20px | A primary content heading (entry title)                                              |
| 22px | A standout number (a large stat, e.g. view count)                                    |

Font family: `'Helvetica Neue', Helvetica, Arial, sans-serif`, line-height `1.45` as the body
default (tighter, `1.25`, for compact overlay text; looser, `1.5`–`1.6`, for longer-form body
copy like descriptions and comments).

## Spacing & radii

Spacing is not on a strict 4px or 8px grid but stays within a small, consistent set:
`2, 4, 5, 6, 8, 12, 14, 16, 18, 20, 22, 24, 32` (px), reused across margins, padding and flex
`gap`. Pick from this set rather than an arbitrary value; the fine-grained ones (2, 5, 6px) are for
icon-adjacent spacing, the larger ones (24, 32px) for page/section padding.

Border radius follows role, not a fixed scale:

| Radius | Role                                                                  |
| ------ | --------------------------------------------------------------------- |
| 2px    | A thumbnail/image tile                                                |
| 4px    | A button or small icon control; a small square thumbnail (extras row) |
| 8px    | A pill-shaped input/control container (search box, zoom control)      |
| 14px   | A rounded tag chip                                                    |
| 50%    | A circular icon button                                                |

## Layout & information hierarchy

Priority is expressed through position and size together, not colour alone:

- The single most important fact on a screen — a journal owner's name — sits top-left at 20px
  bold. Its supporting metadata (handle, since-date, entry count) sits directly beneath at 13px
  muted. Same block, two tiers, built from weight + colour + size stacked vertically rather than
  spread across separate regions of the screen.
- The one primary call-to-action is always top-right, rendered as the saturated green pill button
  ("Backup now"). It's placed to be the single heaviest element competing with the header itself
  for attention — there is never more than one button at that weight on screen.
- System/secondary status — up-to-date indicator, entries-archived count, last-entry date,
  last-backup time, next scheduled run, "View log" — is demoted to a thin strip at the very bottom
  of the window: small icon+muted-text pairs, present when needed, ignorable otherwise. The account
  sidebar follows the same demotion pattern, using `--bg-alt`/`--line-2` to recede rather than
  compete with the main content pane.
- Per-account backup status (the RAG dot) is anchored to the same fixed corner of the avatar
  thumbnail every time. The position is learned as much as the colour is — colour alone is a poor
  and inaccessible channel to carry status on its own.

## Photo-forward content

When entries are present, the photo grid is the largest single area on screen by a wide margin —
toolbar, sidebar, and footer status strip all size themselves to fit around the grid, never the
grid around them.

- Thumbnails sit in a tight, near-zero gap with a minimal 2px radius — deliberately less rounding
  than any other UI element (buttons 4px, pill inputs 8px, tag chips 14px), so photos read as
  content/print-like rather than as another rounded "card" in the UI.
- A single-entry view inverts the emphasis further: the photo runs full-bleed width at the very top
  of the scroll; title, description, and EXIF metadata are pushed below it in muted/secondary
  treatment. The image is always encountered before any text.
- Where a photo doesn't fill its frame, `--photo-bg` contains it as a neutral letterbox — kept
  visually inert (not reused as a general placeholder colour) so it never reads as a card
  background competing with the photo.
- Avatars are the one place a photo appears small and chrome-adjacent (header, sidebar list);
  everywhere else, if a photo is present it is sized to lead the screen, not to illustrate a line
  of text.

## Interaction states

- **Hover, low-emphasis controls** (icon buttons, nav buttons): background fills with `--line-2`.
  No colour change on the icon/text itself.
- **Hover, text/link-style controls** (reaction links, inline actions): text colour shifts from
  `--ink-2`/`--green-700` to `--green-800`, no background change.
- **Hover, photographic tiles**: a dark gradient overlay fades in (`opacity 0 → 1`, ~140ms), rather
  than a background or border change — appropriate only where the hovered element is an image.
- **Disabled**: `opacity: 0.4` plus `cursor: default` (see `global.css`'s `button:disabled`). Not a
  colour swap — don't invent a separate "disabled grey" token.
- **Selection**: a 2px outline in `--green-800`, offset 1px from the element (not a border, which
  would shift layout) — used for the selected state in a grid of tiles.
- **Transitions**: short and linear-ish, ~140ms, only on the properties above (opacity, background
  colour). Don't animate layout properties.
- **Error state**: an inset red box-shadow pulse (`error-flash` keyframe, using `--color-danger` at
  reduced alpha) rather than a red fill or border swap — consistent with the "no colour swap for
  disabled" rule above: transient state changes prefer a motion/glow cue over restyling the
  element's resting colours.
- **In-progress state**: a slow opacity `pulse` keyframe (100% → 60% → 100%) on the relevant icon or
  indicator, plus a `spin` keyframe on any refresh/loading icon. Panels that appear (e.g. a
  settings drawer) fade and slide up slightly on entry (`panelIn`); toasts slide in from the right
  (`b-ark-toast-in`). All of these read as "something changed here", never as decoration.
- **Status colour is domain vocabulary, not generic severity**: the RAG triad
  (`--rag-green`/`--rag-amber`/`--rag-red`) is reserved for backup-run state specifically — amber
  means "backup in progress/queued", not "warning" in the usual UI sense — and is defined by the
  consuming app on top of this package's base tokens (see the `--color-danger` note under Colour).
  `--rag-green` is also deliberately a different, more saturated green than the brand
  `--green-700`/`--green-800` used for chrome and buttons, so a status dot is never visually
  confused with a plain interactive or branded element, even though both read as "the app's green"
  at a glance.

## Applying this in `b-mobile`

Ionic ships its own CSS custom properties (`--ion-color-*`, `--ion-background-color`, …).
`b-mobile`'s own theme file (see `app-architecture.md` §5) maps this package's tokens onto those,
so the shell inherits this palette rather than Ionic's defaults — that mapping is Capacitor/Ionic
-specific and lives in `b-mobile`, not here. This document only states the values and the
conventions behind them; it does not prescribe how any particular framework consumes them.
