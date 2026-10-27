# Blipfoto status page (unofficial): design screenshots

> **Temporary reference. Remove this folder once the status page is live** (tracked in
> b-oss#492). The images are visual targets for the build, not documentation of the
> finished page; once the real page exists they only go stale. They stay in git history if anyone
> needs them.

Visual reference for building the b-oss status page and its "How this works" page. Build it with
the existing b-oss CSS (`packages/b-site/public/site.css`) and the Astro layout in `packages/b-site`,
extending the CSS where the spec needs new tokens. These images show **what** to build, not how to
code it: do not try to reproduce any generated markup.

- Screenshots are 2x (retina). Desktop is 1280 px wide; mobile is 390 px wide.
- All data in the images is mock data: dates, incidents, durations and counts.
- The wording in the screenshots is the intended copy, **except where "Differences from the images"
  below says otherwise**.
- `spec/` holds the colours, type sizes, spacing, component inventory and keyboard model.
- The PNGs are palette-quantised for repo size (visually lossless); the spec sheet's hex values are
  the source of truth for colour.

## Differences from the images (these win)

1. **No "you can share again after 15:20".** The "already shared recently" state (G5) must not
   say when sharing is possible again: we don't want to encourage repeat shares. Say only that
   they've shared recently and that it still counts.
2. **Privacy.** The form has **no privacy sentence** (design pass 3). A small centred "Privacy" link
   under the Turnstile box points at the site-wide privacy policy, `privacy.html` (added separately).
   The page and How this works must not claim anonymity or describe how the IP address is handled
   beyond "used briefly to limit repeat reports"; the policy page is where the detail lives.
3. **Footer tagline.** The mockups' "Blipfoto - Open Source Software" under "b-oss" reads as though
   Blipfoto is the product. Use wording that makes the relationship clear (e.g. "Open-source tools
   for Blipfoto users"). The site-wide fix is tracked separately; the status pages use the shared
   footer, so don't hard-code a tagline on them.
4. **Support links.** Every "Blipfoto Support" / "contact Blipfoto" link points at Blipfoto's own support-request page (`https://blipfoto.zendesk.com/hc/en-gb/requests/new`), and the disclaimer's "Blipfoto support" at the general help (`https://www.blipfoto.com/help`); both are constants in `packages/b-site/src/blipfoto-links.ts`. The Turnstile box is still a placeholder until its site key exists.
5. **How this works** makes claims about the implementation (what the Site and API checks do, the
   30-minute limit, and so on). They must be checked against what was actually built, and are not
   to be copied from the mockup unverified.
6. **Nav.** The mockup's header nav shows Home, b-ark, b-mobile, b-api, Status, Contact. Use the
   site's real nav from `Header.astro` and add Status.

7. **Couldn't load the current status** (not in the mockups). If the snapshot can't be fetched,
   the Now card says so in a distinct amber-marked state ("Couldn't load the current status … that
   doesn't mean Blipfoto is down"), never shows Up, and keeps any earlier data visible below
   marked "Out of date: this is the status as of HH:MM". With no earlier data it shows no Site/API
   cards at all. "Try again" is the Refresh control.
8. **Stale data.** A snapshot older than two sampling intervals is shown as Unknown ("No recent
   data"), even if its last state was Up.
9. **Refresh** is a button with no auto-refresh. (The original rule, no request before
   `next_refresh_at` with a 60 s / 2 min / 5 min back-off, is superseded by item 13.)
10. **User reports** (the mockups' "Shared" lane) are drawn from an optional `shares` field in the snapshot
    (b-oss#486); without it the Shared lanes are simply empty.

11. **History is a fixed 30 days.** There is no 30d/90d/1y/All-time control and no weekly view; the
    mockups `05b` and the range buttons are superseded. Longer periods are covered by the uptime
    table and the incident list. With 30 columns the bars are slim (capped at 18 px) and the axis
    labels a date every 7 days, plus "Today".

12. **Percentages:** one decimal place, rounded down; 99.9x figures show up to three decimals so
    they are never rounded up to 100%; supersedes the two-decimal figures in the screenshots.

13. **Shares appear immediately.** The 201 response carries the updated share aggregates, which the
    page swaps in and redraws, so the poster sees their share counted at once. After Done the form's
    hint line says so (no layout jump). The Refresh floor is 60 s after the last fetch, whatever
    `next_refresh_at` says; `next_refresh_at` only drives the "Next check due about HH:MM" label and
    the stale rule. Supersedes the previous refresh-gating rule.

14. **Design pass 1 supersedes the mockups' look** (the screenshots are now only a record of the
    original structure). The page has one solid status banner (brand green when Up, red when
    Down, hatched grey when Unknown, amber when it couldn't load) with Site and API as compact
    rows; no "How this is measured" section (a single "How this works" link instead); one
    "Unofficial" notice at the top and one "reports stay on this page" line at the Share button
    (no "Need help" aside, no repeated disclaimers); no repeated 30-day summary line (the figure is
    in the Uptime table); and a single centred report column. See the terminology note below.
    **Pass 2** removed more redundancy: the page title is the banner headline itself (the only h1);
    no "Site and API are both up" sentence; no "Next check about HH:MM" (nothing shows when the next
    check is due); no "Share a problem" link in the banner; "How this works" sits in the banner
    footer; Refresh is the standard circular-arrow icon button; the Turnstile box sits under the
    Share button; no visible "Answer both questions" hint (Share keeps an `aria-describedby`
    reason); no "Resolved" chip on past incidents and no repeated "No downtime" under every 100%.

## Terminology (visible text and docs; code identifiers and API field names such as `shares` are unchanged)

- **Website** and **API**: the two monitored parts. In the status banner the rows read
  "Website" and "API / apps" (compact, one line each); everywhere else "Website" and "API".
- **Working / Not working / Unknown**: a part's state right now. Unknown = no recent data (the
  monitor's fault, not necessarily Blipfoto's). Not "Up" / "Down" or "available".
- **Downtime**: time spent not working ("21 h downtime", "No downtime"). **Incident**: one recorded
  period of not working. Not "outage"; "problem" is not used for anything we measure.
- **Check**: the automated test every 15 minutes. **No data**: a stretch of time we couldn't
  check (shown striped).
- **User report**: what a visitor submits; always "not verified". **Share** is the _action_ only
  (the button; "you've shared a report recently"), never the thing.
- The report section's heading is the invitation "Seeing a problem?" with "Share it with others."

## Files

| File                                             | What it shows                                                                                                                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `desktop/01-A-all-good.png`                      | Both up, empty 48-hour lanes, mostly empty history                                                                                                                                   |
| `desktop/02-B-api-down.png`                      | API down now, Site up. Ongoing block runs to "Now"; its pop-up is pinned open                                                                                                        |
| `desktop/03-C-both-down.png`                     | Photos failing, so both are down; the headline explains it is one cause                                                                                                              |
| `desktop/04-D-unknown-no-data.png`               | Monitor has no recent data. Both show Unknown; gaps are hatched grey                                                                                                                 |
| `desktop/05-E-busy-history.png`                  | Busy history: short outages, one 3 h 15 min outage, one bar clipped at 4 h (true value shown above it), and a day where people shared problems but checks found none (pop-up pinned) |
| `desktop/05b-E-busy-history-all-time-weekly.png` | Same, with "All time" selected: weekly columns                                                                                                                                       |
| `desktop/06-F-new-deployment.png`                | Monitoring started today: "Started checking at 09:15 today" treatment in lanes and history                                                                                           |
| `desktop/07-how-this-works.png`                  | The separate explanation page                                                                                                                                                        |
| `mobile/01–03-*-390.png`                         | States A, B and C at phone width                                                                                                                                                     |
| `mobile/07-how-this-works-390.png`               | How this works at phone width                                                                                                                                                        |
| `components/G-share-form-states.png`             | Share form: default, filled, sharing, thank-you interstitial, already shared recently, error                                                                                         |
| `components/share-form-default.png`              | Share form on its own                                                                                                                                                                |
| `spec/spec-tokens-components-accessibility.png`  | Tokens, component inventory, keyboard and focus model                                                                                                                                |

## Behaviour the images can't show

**Overall**

- There are two components, **Site** (the website in a browser) and **API** (used by apps such as b-ark and b-mobile). They are shown and counted separately everywhere.
- Status is **Up**, **Down** or **Unknown**. Unknown means our monitor has no recent data. Unknown is never counted as up or down.
- No auto-refresh. The page shows "Updated HH:MM" and a Refresh link.
- Times of day are shown in UK time. History days are UTC days.
- The disclaimer strip appears on every page, under the header.

**Last 48 hours**

- Each component has an outage lane. Only problems are drawn:
  - red block = Down;
  - hatched grey = no data;
  - white area with a dashed edge = not yet monitoring.
- Blocks have a minimum width of 6 px, so a single 15-minute outage is visible.
- An ongoing outage block sits flush against "Now".
- Under each outage lane is a thin amber **Shared** lane for that component: bars per hour, scaled to max(5, busiest hour).
- Hour ticks; labels every 6 h on desktop and every 12 h on mobile; dashed lines at day boundaries; "Now" at the right edge.
- Clicking or tapping a mark opens a short pop-up: what failed, when, "About N minutes". Pop-ups on shared bars say "Not verified".

**History**

- One column per UTC day for 30 days, 90 days (the default) and 1 year. "All time" uses one column per week.
- Column height is the minutes down on an absolute scale with a 4-hour ceiling; minimum height 3 px.
- A bar over 4 h is drawn full height with a white diagonal cut, and its true value is printed above it.
- Hatched strip under each chart = days with no-data periods.
- Each panel has its own amber Shared lane.
- If shared problems exist where the checks found nothing, the pop-up adds "Our checks found no problem with the Site/API".

**Uptime table**

- Rows: 24 hours, 7 days, 30 days, last year, all time; columns Site and API.
- Each cell shows the uptime percentage and "N min down · N incidents".
- Rounded down: 100% only when nothing was measured. No-data periods are left out of the calculation.

**Incidents**

- Newest first: Ongoing/Resolved chip, title, component and times, approximate duration.
- One row when a single cause affected both components ("Site and API").
- Show 5, then a "Show N more" button.

**Share a problem form**

- Required: "What are you using?" (The website → Site, An app → API) and "What's happening?" (It's offline / It's not working right).
- Optional toggle chips: Login, Uploads, Slow, Unreliable.
- Cloudflare Turnstile widget, then the **Share** button with the "does not go to Blipfoto" notice beside it.
- After a successful share, show the thank-you interstitial with a Contact Blipfoto Support button.
- One share per 30 minutes; after that, show the "already shared recently" state.
- No free text and no personal data.

**Mobile (below 640 px)**

- Lane labels sit above the charts.
- Pop-ups are replaced by a readout card with 44 px "Earlier" / "Later" buttons that step through every mark.
- Range buttons stretch to full width.
- All tap targets are at least 44 px.

**Accessibility**

- Colour is never the only signal: each state has a different shape, fill or hatch, plus a text label.
- Every chart mark is reachable by keyboard. Use one tab stop per lane with arrow keys moving between marks (roving tabindex).
- The incident list and uptime table are the text alternative to the charts. A skip link points to them.
- Focus ring: 3 px #2a6347, 2 px offset.
- Respect prefers-reduced-motion.
