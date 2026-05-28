# b-oss website

Static HTML/CSS site for **b-oss** (Blipfoto Open Source Software). Designed to match
the visual language of the b-ark Windows app: green-800 top bar, Helvetica wordmark,
clean white surfaces.

No build step. No JavaScript framework. Drop the contents of this folder onto any
static host (GitHub Pages, Netlify, S3, plain Apache) and you're live.

---

## Structure

```
website/
├── index.html          Homepage — b-oss intro + b-ark app card
├── b-ark.html          b-ark product page + Download / Guide / Source links
├── b-ark-guide.html    Full b-ark user guide
├── contact.html        Contact form (Web3Forms)
├── site.css            All shared styles
└── assets/
    ├── b-oss-icon.png            App icon (small)
    ├── b-oss-icon-large.png      App icon (large, used in heroes)
    ├── b-ark-screenshot.png      Homepage screenshot of b-ark
    ├── favicon.ico               Multi-resolution favicon (16/32/48)
    ├── favicon-16.png
    ├── favicon-32.png
    ├── apple-touch-icon.png
    ├── icon-192.png
    ├── icon-512.png
    ├── site.webmanifest
    └── guide/                    Screenshots embedded in the user guide
        └── (see TODO list below)
```

---

## TODO before going live

### 🔑 Contact form access key

`contact.html` uses [Web3Forms](https://web3forms.com) to deliver messages by email.

- [ ] Create a Web3Forms access key at <https://web3forms.com> (free tier is fine).
- [ ] Open `contact.html` and replace `YOUR_WEB3FORMS_ACCESS_KEY` (in the hidden
      input on line ~33) with your real key.
- [ ] Optionally update the hidden `subject` field on the next line so emails arrive
      with a recognisable subject.
- [ ] Send a test message to confirm delivery.

### 🔗 Live URLs on b-ark page

`b-ark.html` has placeholder `href="#"` links on two of the three big link cards:

- [ ] **Download** card — link to the latest GitHub release. Either pin a specific
      release URL, or use the "latest" alias: `https://github.com/IanMStevenson/b-oss/releases/latest`.
- [ ] **Open Source** card — link to the b-oss repo:
      `https://github.com/IanMStevenson/b-oss`.

A `TODO` comment in the file marks both spots.

### 📸 User guide screenshots

The user guide references 11 screenshots that are not yet in the repo. Drop them
into `assets/guide/` using these exact filenames:

- [ ] `edge-download-warning.png`
- [ ] `chrome-download-warning.png`
- [ ] `smartscreen-initial.png`
- [ ] `smartscreen-more-info.png`
- [ ] `choose-folder.png`
- [ ] `welcome.png`
- [ ] `account-connected.png`
- [ ] `backup-progress.png`
- [ ] `settings-panel.png`
- [ ] `b-view-grid.png`
- [ ] `b-view-entry.png`

PNG or JPG both work — adjust the `.png` extension in `b-ark-guide.html` if you
prefer JPGs.

### 📝 Content review

- [ ] Re-read the homepage About copy — confirm Ian's bio wording is right.
- [ ] Re-read the b-ark feature list (Back up / View / Publish / AI-ready) — adjust
      tone if you'd prefer something less marketing-y.
- [ ] Decide if the Download tile should mention macOS/Linux once those builds exist.

### 🚀 Optional polish (later)

- [ ] Open Graph / Twitter Card meta tags for nice social previews
- [ ] `sitemap.xml` and `robots.txt`
- [ ] Plausible / GoatCounter / similar privacy-friendly analytics

---

## Design system notes

If you're tweaking the look in Claude Code, the design tokens are all CSS custom
properties at the top of `site.css`:

```css
--green-900: #143729; /* very dark — text on green */
--green-800: #1f4d3a; /* top bar background, primary button */
--green-700: #2a6347; /* hover state */
--green-100: #eef2ee; /* feature tick background, tri-link icon background */
--green-50: #f6f8f6; /* hover surface */
--ink: #111111;
--muted: #6b7280;
--line: #e5e7eb;
--font: 'Helvetica Neue', Helvetica, Arial, sans-serif;
```

All four pages share:

- `header.topbar` — sticky green top bar with right-aligned nav
- `main.page` (or `main.page.narrow`) — max-width container
- `section.hero` — page-top heading + lead
- `section.block` — body sections with `.section-eyebrow` label + content
- `footer.footer` — light footer line

Reusable patterns:

- `.app-card` — homepage app entry (image + meta grid)
- `.feature-list` — bulleted feature list with green tick discs
- `.tri-links` — three big icon cards on the b-ark page
- `.form` + `.input` / `.textarea` — contact form
- `.prose` — long-form content (used on the guide page); includes table, blockquote
  and figure styles
- `.toc` — table of contents block (used at the top of the guide)

---

## Deploying

Any static host works. A couple of zero-config options:

**GitHub Pages**

```
git init
git add .
git commit -m "Initial site"
git remote add origin <repo-url>
git push -u origin main
```

Then in repo Settings → Pages, set the source to `main` / root.

**Netlify drop**

Drag the entire folder onto <https://app.netlify.com/drop>. Done.

**Local preview**

```
cd website
python3 -m http.server 8000
# then open http://localhost:8000
```

---

## License

Code is yours. The icon and any blipfoto-branded screenshots are subject to b-oss
/ blipfoto's own licensing.
