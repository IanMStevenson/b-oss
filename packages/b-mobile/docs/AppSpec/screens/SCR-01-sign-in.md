# SCR-01 — Sign In   [Must]

**Purpose:** Authenticate via Blipfoto OAuth so the app can act on an account. Two distinct
entry shapes: a **gated action** (always signs in read-write, no mode choice), or a **deliberate**
sign-in (nav "Sign in", or "Add account" in `SCR-30`) which offers the full sign-in mode choice.

**Reached from:** any gated action (`FLW-01`); a "Sign in" item in primary navigation; "Add
account" in `SCR-30` (`FLW-20`); a deep link / push target that requires an account.
**Leads to:** on success, **returns to the pending action / previous screen** (gated case) or to
`SCR-30`/the newly-active account (deliberate case) — not a fixed home; "Create account" opens
the **browser**; the OAuth provider screen is external.

See [api-appendix/auth.md](../api-appendix/auth.md) for the sign-in modes, the two-token model,
and why gated actions skip mode choice.

## Layout (ASCII wireframe)

**Deliberate sign-in** — shows the mode choice:
```
+--------------------------------------+
|            [ Blipfoto ]              |   logo / wordmark
|     One photo. Every day.           |   short tagline
|                                      |
|   How do you want to sign in?        |
|                                      |
|   (o) Read-write             [i]     |   default selection
|       Post, react, comment, follow   |
|   ( ) Read-only              [i]     |
|       Browse and read only —         |
|       no posting or reacting         |
|                                      |
|   [ ] Get notifications              |   toggle, available with either mode
|                                      |
|   +------------------------------+   |
|   |        Continue              |   |   primary: launches OAuth
|   +------------------------------+   |
|                                      |
|   New to Blipfoto?  Create account ->|   opens registration in browser
|   Terms   ·   Help                   |
+--------------------------------------+
```

**Gated-action sign-in** — no mode choice, always read-write:
```
+--------------------------------------+
|            [ Blipfoto ]              |
|   Sign in to post your photo         |   names the specific pending action
|   +------------------------------+   |
|   |        Sign in               |   |
|   +------------------------------+   |
|   New to Blipfoto?  Create account ->|
|   Just looking?  Browse without      |   only when entry was optional,
|   signing in                         |   not a true gated action
|   Terms   ·   Help                   |
+--------------------------------------+
```

## First-run mode explainer

The **first time** the user reaches this screen deliberately (nav "Sign in", or "Add account"), a
brief explainer appears **above the mode choice**, before they pick. Read-only vs read-write is the
one genuinely unfamiliar idea in the app, and it is the only thing explained up front — there is no
onboarding carousel, and this is not shown at launch, on the gated-action shape, or ever again once
dismissed.

Shape: an inline panel or a small sheet with a single **Got it** dismissal. It is informational, not
a decision — dismissing it leaves the user on `SCR-01` with the default (read-write) still selected.

**Draft copy — for review, not final.** This is the first user-facing text in the app and sets the
tone for the rest; treat it as a starting point rather than a settled string.

> **Two ways to sign in**
>
> **Read-write** lets you do everything: post your daily photo, star, favourite, comment and follow.
> Most people want this.
>
> **Read-only** signs you in to browse and read, and nothing else. Nothing you do can change your
> account. Useful if you mostly look rather than post, or you'd rather this app couldn't post as
> you.
>
> You can change this later for any account, and you can add more than one account.
>
> [ Got it ]

The two `[i]` affordances beside the mode options carry the same distinction in shorter form, and
remain available after the explainer is dismissed:

- **Read-write `[i]`** — "This app can post entries, comment, star, favourite and follow on your
  behalf, and change your settings."
- **Read-only `[i]`** — "This app can see everything you can see, but can't change anything — no
  posting, reacting, commenting or following. You can switch to read-write later without losing the
  account."

## Components & data shown
- App branding + short tagline.
- **Contextual reason line** (gated case) — names the triggering action (e.g. "Sign in to post
  your photo"); generic prompt otherwise.
- **Mode choice** (deliberate case only) — Read-write / Read-only, with a short one-line
  explanation of each and an `[i]` for more detail; defaults to Read-write.
- **Notifications toggle** (deliberate case only) — available regardless of which mode is
  selected; see [auth.md](../api-appendix/auth.md) for what it implies.
- **Sign in / Continue** button — launches Blipfoto OAuth (implicit grant). Labelled "Continue"
  in the deliberate case (a choice was made first), "Sign in" in the gated case.
- **Create account** link — opens the Blipfoto registration page in the device browser (no in-app
  registration).
- **Browse without signing in** — shown only when sign-in was *offered*, not when the user is
  mid-way through a true gated action.
- **Terms** and **Help** — open the respective Blipfoto web pages in the browser.

## States
- **Idle** — the form above (mode choice shown or not, per entry shape).
- **Authenticating** — after returning from the OAuth provider, while the app reads the token from
  the redirect and verifies it; blocking progress indicator.
- **Second authorization** (Read-write + notifications only) — after the first (read-write)
  token is obtained, the screen shows a brief, explicit interstitial ("One more step — authorize
  read-only access for notifications") before launching the **second**, separately-visible OAuth
  round for the read-only token. This step is never skipped or hidden — see
  [auth.md](../api-appendix/auth.md).
- **Error** — OAuth failed, was declined, or the returned token failed verification; clear
  message, retry stays
  on this screen. If it fails on the *second* authorization of a two-token sign-in, the
  already-obtained read-write token is kept (the user is signed in read-write; notifications
  simply aren't enabled yet — retry is offered without discarding the first token).
- **Cancelled** — the user backed out of the OAuth provider; return to Idle without an error
  banner.
- **Success** — token(s) stored, account added/updated and made active; the screen closes and
  the **pending action resumes** (gated case, `FLW-01`) or the app opens on the newly-active
  account (deliberate case, `FLW-20`).

## Actions & rules
- **Mode choice** (deliberate only) → determines which single OAuth round runs (Read-only or
  Read-write) plus whether a second, read-only round follows for notifications. See the
  mode/token model in [auth.md](../api-appendix/auth.md).
- **Sign in / Continue** → run OAuth (implicit grant); on success store the resulting token(s)
  against a (new or existing) account and use the appropriate one as bearer; then resume the
  pending action (gated) or land on the newly-active account (deliberate).
- **Create account** → open the browser at the Blipfoto registration page; on return, the user
  can sign in normally. No in-app account creation.
- **Tokens are effectively indefinite** — no refresh step; a session ends only via account
  removal, mode downgrade (which revokes the now-unneeded token), or forced logout.
- **Forced logout interplay** — if a later call returns the invalid-session code for this
  account, the app returns here (or re-offers sign-in in context) for that specific account only;
  see [error-codes.md](../api-appendix/error-codes.md) and `FLW-02`.
- **Logged-out browsing remains available** — declining sign-in (where allowed) keeps the user in
  anonymous mode using the app-level credential.

## API touchpoints
- **Blipfoto's authorization page**, opened with `response_type=token` and the scope the chosen
  mode needs (`read` or `read,write` — always sent explicitly). The token arrives in the
  **redirect back into the app**; there is no `POST oauth/token` and no code-exchange step.
- `GET oauth/token` — after each authorization, confirm the token was issued to this app and read
  back its granted scope.
- The authorization round runs **once** for Read-only or Read-write, and **twice** (sequentially,
  both visible to the user) for Read-write + notifications.

See [endpoints.md](../api-appendix/endpoints.md) and [auth.md](../api-appendix/auth.md).

## Acceptance criteria
- [ ] Given an anonymous user taps a gated action, the screen shows no mode choice, names the
      pending action, and signs in read-write on success, resuming that action.
- [ ] Given a deliberate sign-in (nav, or Add account), the screen offers Read-write/Read-only
      and a notifications toggle, defaulting to Read-write.
- [ ] Given the first deliberate visit to this screen, the mode explainer is shown once, is
      dismissible, and does not appear again — nor on the gated-action shape, nor at launch.
- [ ] Each mode's `[i]` opens its explanation, and stays available after the explainer is
      dismissed.
- [ ] Given Read-write + notifications is chosen, the user sees **two** distinct, named
      authorization steps, never a single button that silently does both.
- [ ] Given the second authorization (notifications) fails or is cancelled, the first
      (read-write) token is retained and the account is signed in without notifications.
- [ ] Given the user taps **Create account**, the Blipfoto registration page opens in the browser
      (not in-app).
- [ ] Given OAuth fails or is declined, the user sees a clear message, stays on this screen, and
      no partial session is stored for a failed *first* authorization.
- [ ] Given sign-in was merely offered (not required), a "browse without signing in" option keeps
      the user anonymous.
