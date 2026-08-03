# Authentication & session

How the app authenticates to Blipfoto, what a session consists of, and how sign-in modes and
multiple accounts are managed.

## Provider & flow

- **Blipfoto's own OAuth**, **implicit grant**. The app registers with Blipfoto as an installed
  app, which cannot safely hold a client secret, so it uses the implicit flow: the app opens
  Blipfoto's authorization page with `response_type=token`, the user signs in and consents, and
  the app receives an access token directly via a redirect back into the app — there is **no
  separate server-side code exchange step**, and therefore no `POST oauth/token` call.
- After receiving a token, the app should call `GET oauth/token` to confirm it was issued to this
  app and to read back its granted scope. This is the standard mitigation for implicit grant's
  token-substitution weakness, and it is also how the app verifies it got read-only when it asked
  for read-only.

### `state` must be generated and verified on every authorization

The authorization request carries a **`state`** parameter — a random, single-use value the app
generates and Blipfoto passes back unchanged in the redirect. It is required, and it is the app's
only protection against a forged or replayed redirect: without it, any process able to invoke the
app's custom URL scheme could hand it an attacker's token.

Two rules, both mandatory:

1. **Generate a fresh, unpredictable `state` per authorization round** — never a constant, never
   reused between rounds. The two-token sign-in (below) runs two rounds and therefore needs two
   distinct values.
2. **Verify it on return, before the returned token is trusted or stored.** A redirect whose
   `state` is missing or doesn't match the value the app sent is **discarded silently** — not
   surfaced as a sign-in error, since it wasn't the user's sign-in.

This sits alongside `GET oauth/token`, and neither replaces the other: `state` establishes that the
redirect answers *this app's* request; `GET oauth/token` establishes that the token inside it was
issued to *this app*.
- Sign-in yields an **access token** used as a **bearer** on Blipfoto API calls.
- **No social login.** Twitter/Facebook sign-in is dropped entirely.
- **No in-app registration.** A "create account" affordance opens the Blipfoto registration page
  in the browser; the user returns to sign in afterward.

## Sign-in modes

Every sign-in requests one of two scopes, combined with whether push notifications are wanted
(see [02-notifications.md](../02-notifications.md) for why notifications affect the token model):

- **Read-only** — the token can read everything the account can see, but cannot perform any
  write action: no post, edit, delete, star, favourite, comment, follow, approve/refuse a follow
  request, remove a follower, report, or settings change. The app must hide/disable write
  affordances entirely on a read-only account, not rely on the server rejecting the call — see
  [rules.md](../rules.md).
  **Hiding a member remains available** (`SCR-31`, `FLW-10`): it is enforced on the device and
  writes nothing to Blipfoto, so a read-only account can still curate what it sees. *Refusing* a
  follower is a server write and is therefore unavailable read-only.
- **Read-write** — full access; required for posting and every other write action.

Combined with notifications on/off, this gives **four sign-in modes**, chosen at sign-in and
changeable later per account (`SCR-30`, `FLW-22`):

| Mode | Scope requested | Notifications |
|---|---|---|
| Read-only | `read` | off |
| Read-only + notifications | `read` | on |
| Read-write | `read,write` | off |
| Read-write + notifications | `read,write` | on |

### Scope must always be sent explicitly

The two valid scope values are the literal strings **`read`** and **`read,write`**. There is no
third value, and the app must never construct one from user input or configuration.

**Omitting the `scope` parameter is not a neutral default — it grants full read+write.** A
sign-in that forgets to send it produces a token indistinguishable from a read-write token, which
silently defeats read-only mode entirely: the UI would hide the write affordances while holding a
token fully capable of writing. Treat `scope` as a required parameter on every authorization
request, and prefer an implementation that makes the two values the only representable options
rather than accepting a free-form string.

**A gated action always signs in read-write.** When sign-in is triggered by a specific action
that needs an account (post, star, comment, follow, manage profile), the app signs in directly
with read-write, notifications off, skipping mode selection entirely — asking someone who just
wants to star a photo to choose between four modes first is the wrong trade, and read-only
couldn't satisfy the action anyway. Full mode choice is offered only when sign-in is reached
deliberately: the **Sign in** nav item, or **Add account** in `SCR-30`. See `SCR-01`, `FLW-01`,
`FLW-20`.

## How many tokens each mode holds

**The app always holds a token for itself** — read or read-write, depending on the mode. Whether a
*second* token exists depends only on whether notifications are on **and** the app's own token is
read-write:

| Mode | App's own token | Token given to the notification service |
|---|---|---|
| Read-only | `read` | — |
| Read-only + notifications | `read` | **the same `read` token** — one token, two users of it |
| Read-write | `read,write` | — |
| Read-write + notifications | `read,write` | a **second, separate** `read` token |

So "the read token" means different things in different modes, and it is worth being precise
because several rules elsewhere depend on it:

- In **read-write + notifications** the two tokens are genuinely independent. The service's token
  is not used for anything the app does, so losing it costs notifications and nothing else.
- In **read-only + notifications** there is only one token, shared. It is the account's *only*
  credential, so losing it is an ordinary whole-account forced logout — there is no
  notifications-only failure mode in this mode, and the app must not present one.

### Why read-write + notifications needs two tokens

The cloud notification service ([02-notifications.md](../02-notifications.md)) polls Blipfoto on
the user's behalf and must never hold
a token capable of writing — a compromised or misbehaving third-party service must not be able
to post, delete, follow, or change anything on the user's account. So **read-write +
notifications requests two independently-scoped tokens**: one read-write token the app keeps for
itself, and a separate read-only token handed to the notification service.

In read-only modes that separation is already satisfied by the app's own token — it cannot write
either — so no second authorization is needed and none is asked for.

Blipfoto's OAuth cannot issue two differently-scoped tokens from a single consent, so this mode
requires **two separate, visible authorization steps** — one per token. This must not be hidden
behind a single button or a silent second redirect: both steps are shown to the user as distinct,
named sign-in actions. See `FLW-20`.

## Token lifecycle

The app tracks **read-token and write-token possession independently, per account**. One
invariant governs everything: **the tokens held for an account always exactly match what that
account's current mode needs — nothing more, nothing less.** Two rules maintain it:

1. **A token the target mode needs, that isn't already held, requires a fresh, explicit
   authorization.** There is no way to silently upgrade an existing token's scope.
2. **A token that's held but the target mode no longer needs is revoked immediately** — a real
   server-side revoke, not just ceasing local use. Signing an account out is the case where the
   target needs no tokens at all: revoke whatever is held.

Applying this to every mode change:

| From ↓ / To → | Read-only | Read-only + notif. | Read-write | Read-write + notif. |
|---|---|---|---|---|
| **Read-only** | — | free | new auth (write) | new auth (write); keep read token |
| **Read-only + notif.** | free | — | new auth (write) | new auth (write); keep read token |
| **Read-write** | new auth (read); revoke write | new auth (read); revoke write | — | new auth (read); keep write token |
| **Read-write + notif.** | keep read; revoke write | keep read; revoke write | revoke read; keep write | — |

Two consequences worth being deliberate about in the UI (`FLW-22`):

- **Any move into a read-write mode from read-only always needs a fresh authorization** — never
  free, even if the account was read-write before.
- **Toggling notifications on/off while read-write needs a fresh read-token authorization every
  time**, not just the first — the read token is revoked whenever notifications go off, so
  re-enabling always starts over.

## Session & forced logout

- The access token is, in practice, **indefinite** — valid until explicitly revoked or
  invalidated server-side. The app needs **no refresh-token logic**.
- **Forced logout** — the server signals an invalid session via an error code on any call (see
  [error-codes.md](error-codes.md)); the app wipes that token's local state. With multiple
  accounts, and up to two tokens per account, a forced logout on a token that isn't the active
  account's (e.g. the notification service's *separate* read token, in read-write + notifications,
  going stale in the background) must be handled without disrupting whichever account the user is
  currently viewing. See `FLW-02`. In **read-only + notifications** the service's token is the
  account's only token, so a stale-token report there is a whole-account forced logout, not a
  background one — see the mode table above.
  Losing one of two tokens while the other survives (e.g. the write token dies but the read token
  is still valid) doesn't remove the account — it immediately narrows what it can do: write-gating
  throughout the app keys off live token possession, not a remembered mode label, so the account
  reads as read-only everywhere until re-authorized. See [rules.md](../rules.md).
- Tokens are stored securely on-device, each attached to the account and purpose (app-use vs.
  notification-service) it was obtained for.
- **Tokens are excluded from OS-level device backup** (e.g. Android's Auto Backup for Apps). A
  backup/restore onto a new or wiped device must never silently carry a live bearer token across;
  the user re-authorizes instead. See [rules.md](../rules.md) (Non-functional requirements).

## Multi-account

- The app supports being **signed into more than one Blipfoto account**, with one **active** at
  a time; all screens reflect the active account. Switching is instant — no network call, no
  re-authorization (`FLW-21`).
- Each stored account runs its **own, independent copy of the sign-in mode and token lifecycle**
  above — one account might be read-write with notifications, another read-only. Adding,
  switching, changing mode, and removing accounts are managed from `SCR-30` (`FLW-20`, `FLW-21`,
  `FLW-22`).
- **Removing an account** revokes whichever tokens it currently holds and forgets it locally. If
  it was the active account, another stored account becomes active, or the app returns to
  anonymous browsing if none remain.

## Anonymous (logged-out) access

- Logged-out browsing of public content is supported. When there is no active account, the app
  sends its **own registered client id** as the bearer.
- **A bearer is mandatory even when logged out** — a call with no authorization is rejected by
  the API. The app must never make a credential-less request.

## Client credentials

- The app ships with its **own registered App ID / Client ID**; registering it is a prerequisite
  for any auth work (see [open-questions.md](open-questions.md)). The same client id serves as the
  anonymous bearer for logged-out calls, and identifies the app when requesting a user token of
  either scope.

## Capability for gated actions

- When an anonymous user triggers an action that needs an account, the app offers sign-in
  (always read-write, see above) and, on success, **resumes the pending action** (e.g. completes
  the post, applies the star). See [FLW-01](../flows/) and [rules.md](../rules.md).

## Cross-references

- Behavioural rules: [rules.md](../rules.md) (Authentication & session).
- Forced-logout error code: [error-codes.md](error-codes.md).
- Sign-in / accounts flows: `FLW-01`, `FLW-02`, `FLW-20`, `FLW-21`, `FLW-22`.
- Accounts screen: `SCR-30`.
