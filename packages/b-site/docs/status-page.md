# Status page: design record

The unofficial Blipfoto status page (`status.html`) and its explanation page (`how-this-works.html`).
Why it exists and how it is built: b-oss#476 and `packages/b-status/ARCHITECTURE.md` (the monitor),
`packages/b-site/README.md` (the page's code). This file records the **design decisions** reached in
review, so they survive after the mockups are gone. Where this file and the code disagree, fix one of
them.

## Principles

- Answer "is it just me?" in two seconds, plainly, with no jargon.
- Say each thing once. One "Unofficial" notice at the top; one line at the report form saying reports
  stay on this page (not sent to Blipfoto), with the support link; the fuller explanation lives on
  How this works and the privacy policy. No repeated disclaimers, no restating subtitles.
- Honest about what we don't know. Unknown is never counted as working or not working. User reports
  are never presented as verified and never change uptime.
- Calm, confident, plain. Strong hierarchy (bold section headings with a rule above), dark text.

## Terminology (visible text; code identifiers and the API field `shares` are unchanged)

- **Website** and **API** are the two monitored parts. Banner rows read "Website" and "API / apps";
  everywhere else "Website" and "API".
- **Working / Not working / Unknown** is a part's state now. Not "Up/Down" and not "available".
  Unknown means no recent data (our monitor's problem, not necessarily Blipfoto's).
- **Downtime** is time spent not working; an **incident** is one recorded period of not working.
  "Problem" is used only in the invitation "Seeing a problem?". **No data** is a stretch we couldn't check.
- **User report** is what a visitor submits (always "not verified"). **Share** is the action only.

## Banner (the top block)

- The headline is the page's only h1. Two compact rows (Website, API / apps), each coloured by its own
  service (Working green, Not working red, Unknown plain grey). The **outer banner takes the colour of
  the Website row**: the website affects everyone; the API affects far fewer people and the fallback is
  "use the website". So the API alone not working is a **green** banner with a red API row and the
  headline "Blipfoto is working, but apps may not connect". No amber banner.
- Headlines: "Blipfoto is working", "The website isn't working" ("Apps should still connect."),
  "Blipfoto is working, but apps may not connect", "Blipfoto isn't working" (photos failing take both
  parts down, and the line says so).
- **One can't-tell state** (plain grey, "We can't tell if Blipfoto is working", both rows Unknown)
  covers "no recent data from the monitor / snapshot older than two intervals" and "couldn't reach the
  status service" (with the last data kept below, dated); the reason line differs by cause.
- Footer line: "Last checked N minutes ago", a plain circular-arrow Refresh icon button (no circle, with a
  focus ring and a 44 px phone target) and a "How this works" link. No "next check" time is shown.

## Behaviour

- **Live while visible, idle while hidden.** A 30 s tick redraws from the loaded snapshot (no
  requests), so "Last checked 15:00 (4 minutes ago)" and the stale rule keep up. One fetch is
  scheduled at the snapshot's `next_refresh_at` plus a few seconds' jitter (about 4 requests an hour),
  never earlier, never inside the 60 s floor; a failure keeps the old snapshot and retries with a
  doubling back-off (60 s up to 10 min). Hidden tabs do nothing; becoming visible redraws at once and
  refetches if `next_refresh_at` has passed. Fixtures (`?fixture=`) never poll. Refresh may fetch again 60 s after the last
  fetch; the Worker serves from memory and re-reads its store at most once a minute, and the browser
  may cache the data for up to a minute.
- **A user report appears within a minute or two, and the page never draws it early.** The page only
  shows what the Worker has published, so a refresh can never make the reporter's own report vanish
  and reappear. The thank-you dialog sets the expectation: "Thanks, your report is in. It can take a
  minute or two to appear on this page." (The Worker patches the report into the stored snapshot at
  once; the delay is the Worker's one-minute in-memory copy plus the browser's 60-second cache, which
  also limit repeat reloads.) A second report within half an hour is refused ("You've already shared a
  report. Thanks. Your earlier report is counted, but this one wasn't added.") and the page never says
  when they can report again (we don't want repeats).
- **Last 48 hours:** outage-only lanes (nothing drawn means nothing wrong); only problems are drawn;
  blocks are at least 6 px wide so a single 15-minute outage is visible; ongoing sits flush with
  "Now"; each lane has a thin amber User reports lane (bars per hour).
- **Last 30 days (fixed, no range control):** one column per UTC day, height = minutes of downtime on an
  absolute scale with a 4 h ceiling (bars over it are cut with a white diagonal and the true value
  printed above); older periods are covered by the uptime table and incident list.
- **Uptime:** rows for 24 hours, 7 days, 30 days, last year and all time; percentages are rounded
  **down**, one decimal, and 99.9x figures show up to three decimals so they are never shown as 100%;
  100% means nothing was measured not working; no-data time is left out of the calculation.
- **Incidents:** newest first, an "Ongoing" chip only while ongoing, one row when one cause took both
  parts down, show 5 then "Show N more". Times of day are UK time; day columns and uptime windows
  are UTC days (How this works explains the difference).
- **Report form:** a single centred column. Required: what you're using (The website / An app) and
  what's happening (It's offline / It's not working right); optional chips (Login, Uploads, Slow,
  Unreliable); Share button, then the Turnstile box centred under it, then one "reports stay on this
  page, not sent to Blipfoto" line with the support link and a small "Privacy" link to the site
  policy. No free text, no personal details are asked for.
- Support links are the two constants in `src/blipfoto-links.ts`.

## Accessibility and mobile

- Colour is never the only signal (icon, words, hatch or shape too); WCAG AA contrast, measured.
- Every chart mark is keyboard reachable (one tab stop per lane, arrow keys, roving tabindex); the
  incident list and uptime table are the text alternative to the charts; a skip link points to them;
  focus ring 3 px `#2a6347`, 2 px offset; `prefers-reduced-motion` respected.
- Below 640 px lane labels sit above the charts and pop-ups become a readout card with 44 px
  Earlier / Later buttons; all tap targets are at least 44 px.

## Trying the design

`npm run preview:status -w @b-oss/b-site -- --out <folder>` writes self-contained single-file previews
of every state (fixture data, a stand-in for the share endpoint) that open straight from disk.
