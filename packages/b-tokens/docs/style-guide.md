# b-oss visual style guide

The written conventions behind `tokens.css`/`tokens.ts` — how the values are actually used across
`b-view` and `b-ark-ui-electron`, the two existing consumers, so a new UI (`b-mobile`) can match
the established look rather than reinvent it. There was no prior style-guide document; this one
was written by reading those packages' CSS, not migrated from somewhere else.

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

## Applying this in `b-mobile`

Ionic ships its own CSS custom properties (`--ion-color-*`, `--ion-background-color`, …).
`b-mobile`'s own theme file (see `app-architecture.md` §5) maps this package's tokens onto those,
so the shell inherits this palette rather than Ionic's defaults — that mapping is Capacitor/Ionic
-specific and lives in `b-mobile`, not here. This document only states the values and the
conventions behind them; it does not prescribe how any particular framework consumes them.
