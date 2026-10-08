# SCR-29 — Help & About   [Should]

**Purpose:** A small hub for help, the icon/badge guide, legal/open-source information, and the
handful of app-level settings that belong to **this installation rather than to an account**.

**Reached from:** primary navigation. Not account-gated.
**Leads to:** the icon guide; external Blipfoto web pages (help, terms), and the privacy policy and
account-deletion page in the browser.

> **Everything on this screen works logged out**: the privacy policy must work for someone who has
> never signed in (anonymous browsing is a first-class state, see [rules.md](../rules.md)).
> Since b-oss#305 the *link-handling toggle* lives in `SCR-25` → App Settings → General and
> *Delete my account* on `SCR-30 Accounts`; neither is on this screen any more.

## Layout (ASCII wireframe)
```
+--------------------------------------+
| <  Help & About                 (av) |
|  HELP                                |
|  Help                           ↗    |  opens website
|  Icon Guide                     >    |  in-app legend of badges/icons
|  Safety & Privacy               >    |  hiding vs refusing, explained
|  Blipfoto Terms & Legal         ↗    |  opens website
|  Blipfoto Privacy Policy        ↗    |  always reachable, signed in or not
|  ABOUT                               |
|  App Version               1.0.0     |
|  Open Source Licenses           >    |  in-app
+--------------------------------------+
```

## Components & data shown
- **Icon guide** — an in-app legend explaining the badge/icon glyphs used across the app
  (shared with `SCR-22 Awards`).
- **Safety & privacy** — a short in-app explainer covering everything a member can do about
  someone else's behaviour, in plain language. It is the discoverable home for the distinction
  [rules.md](../rules.md) specifies, and the reference point when explaining the app's safety
  tools externally:
  - **Hide a member** (`SCR-31`) — you stop seeing them. Personal, immediate, reversible.
  - **Remove a follower** (`SCR-19`) — they lose access to a private journal, but may ask again.
  - **Refuse a follow request** (`SCR-20`) — they stop seeing your journal. Requires a private
    journal, and acts on a *request*, not on someone already following.
  - **Delete a comment** — the journal owner may remove any comment on their own entries.
  - **Report** (`SCR-16`) — escalates an entry *or a comment* to Blipfoto's moderators, who can
    act for everyone.
  - **Cut someone off entirely** — make the journal private, remove them as a follower, refuse any
    fresh request they send, and hide them. Say plainly that this is a sequence, not one switch.
- **Help** and **Terms & legal** — open the respective Blipfoto web pages in the browser.
- **Privacy policy** — opens the app's privacy policy. Available **whether or not anyone is signed
  in**. See [rules.md](../rules.md) (Non-functional requirements) for what it must disclose —
  notably that a third-party cloud service holds a live read-only token whenever push is on.
- **Moved out (b-oss#305):** *Delete my account* (device-level link, never scoped to a stored
  account; see [rules.md](../rules.md) Account deletion) now lives on `SCR-30 Accounts`, and *Open
  blipfoto.com links in this app* (default off, per device) in `SCR-25` → App Settings → General.
- **App Version** and **Open Source Licenses** (in-app list of the runtime libraries shipped in the
  app, including the ProseMirror editor packages) form the About section.

## States
- Static; no loading/empty/error states beyond rendering the list.

## Actions & rules
- **Icon Guide / Safety & Privacy / Open Source Licenses** → in-app static screens.
- **Help / Blipfoto Terms & Legal / Blipfoto Privacy Policy** → open the browser at the respective
  pages.
- **Everything on this screen works logged out.** Nothing here reads or writes an account.
- No Blipfoto API calls.

## API touchpoints
None.

## Acceptance criteria
- [ ] Given the screen, the icon guide, safety & privacy explainer, and open-source licences all
      open in-app.
- [ ] The safety explainer distinguishes hiding from refusing and describes how to combine them.
- [ ] Given Help/Blipfoto Terms & Legal/Blipfoto Privacy Policy, the corresponding page opens in
      the browser.
- [ ] **With no account signed in, every item on this screen — including the privacy policy — is
      reachable and works.**
- [ ] The app version is shown.
