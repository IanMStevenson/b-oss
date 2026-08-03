# SCR-29 — Help & Info   [Should]

**Purpose:** A small hub for help, the icon/badge guide, legal/open-source information, and the
handful of app-level settings that belong to **this installation rather than to an account**.

**Reached from:** primary navigation. Not account-gated.
**Leads to:** the icon guide; external Blipfoto web pages (help, terms), and the privacy policy and
account-deletion page in the browser.

> **This is the only settings-bearing screen a logged-out user can reach**, and that is the point.
> `SCR-25 Settings` is account-gated because almost everything in it writes to an account. The
> link-handling toggle, the privacy policy, and the account-deletion link are not — they describe
> how the app behaves on this device, or point at pages that must work for someone who has never
> signed in. Anonymous browsing is a first-class state (see [rules.md](../rules.md)), so neither the
> policy governing it, nor the means of deleting the account it might later belong to, can sit
> behind a sign-in.

## Layout (ASCII wireframe)
```
+--------------------------------------+
| <  Help & info                  (av) |
|  Icon guide                     >    |  in-app legend of badges/icons
|  Safety & privacy               >    |  hiding vs refusing, explained
|  Help                           ↗    |  opens website
|  Terms & legal                  ↗    |  opens website
|  Privacy policy                 ↗    |  always reachable, signed in or not
|  Delete my account              ↗    |  always reachable, signed in or not
|  Open blipfoto.com links here [ ]    |  device setting, default off
|  Open-source licences           >    |  in-app
|  App version 1.0.0                    |
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
- **Delete my account** — opens Blipfoto's own account-deletion page in the browser, same shape as
  `SCR-01`'s Create account link and available **whether or not anyone is signed in**, for the same
  reason the privacy policy is. Carries a one-line subtitle making the multi-account caveat visible
  in the UI itself, not just in this spec. **This is a device-level link, not scoped to any account
  stored in this app** — it doesn't know or influence which Blipfoto account the resulting browser
  session belongs to, and must never be worded as though it acts on the active account (no "Delete
  `{username}`'s account"). Deleting an account on the web does **not** remove it from this app's
  stored account list — see [rules.md](../rules.md) (Non-functional requirements, Account deletion)
  — the entry simply starts failing like any other forced logout, and the user removes it via
  **Remove account** (`SCR-30`) once they notice.
- **Open blipfoto.com links in this app** — a toggle, **default off**, reversible at any time. The
  app must never claim Blipfoto web URLs without the user having turned this on. Stored **per
  device**, not per account, and therefore unaffected by which account is active or by there being
  none. See [rules.md](../rules.md) (Navigation, deep links & sharing).
- **Open-source licences** — in-app list.
- App version.

## States
- Static apart from the link-handling toggle, which reflects its stored value immediately and
  persists locally; no loading/empty/error states beyond rendering the list.

## Actions & rules
- **Icon guide / Open-source licences** → in-app static screens.
- **Help / Terms / Privacy policy / Delete my account** → open the browser at the respective
  pages.
- **Open blipfoto.com links in this app** → persists locally with no network call, and takes effect
  immediately; turning it off must genuinely release the app's claim on those URLs, not merely
  ignore them once opened.
- **Everything on this screen works logged out.** Nothing here reads or writes an account.
- No Blipfoto API calls.

## API touchpoints
None.

## Acceptance criteria
- [ ] Given the screen, the icon guide, safety & privacy explainer, and open-source licences all
      open in-app.
- [ ] The safety explainer distinguishes hiding from refusing and describes how to combine them.
- [ ] Given Help/Terms/Privacy policy/Delete my account, the corresponding page opens in the
      browser.
- [ ] The Delete my account link never names or implies a specific stored account — it reads as a
      device-level link to Blipfoto's own page, not an in-app deletion of the active account.
- [ ] **With no account signed in, every item on this screen — including the privacy policy, the
      account-deletion link, and the link-handling toggle — is reachable and works.**
- [ ] The link-handling toggle defaults to off, persists per device, and is unaffected by switching
      or removing accounts.
- [ ] The app version is shown.
