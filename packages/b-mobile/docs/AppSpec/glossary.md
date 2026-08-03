# Glossary — domain vocabulary

Plain-language definitions of the entities and terms used throughout the spec. These are the
*concepts*, not wire formats; the field-level data model and API mapping live in
[api-appendix/data-model.md](api-appendix/data-model.md).

---

## Core entities

**Entry** — a single dated photo-journal post: the central object. Has a photo, a title, a
description (rich text), tags, a date, an optional location, and counts for views, stars, and
favourites. Belongs to one member's journal. At most one entry may be published per member per
day. Carries a set of **action flags** telling the current user what they may do with it
(comment, star, favourite, edit, delete).

> Blipfoto's website supports **additional photos** on an entry. That capability is restricted to
> trusted first-party apps and is unavailable here, so this app treats every entry as
> single-photo. See [api-appendix/endpoints.md](api-appendix/endpoints.md).

**Journal** — a member's collection of entries (one per day). Has a title and a privacy setting.
"Browse Just Me" / a profile's Entries tab show a journal's entries.

**Comment** — a top-level remark on an entry, by a commenter. Owns a list of **replies**.
Carries action flags (reply, **edit**, delete) and may be marked unread in the comments inbox.
Editing is limited to one's own comment; deleting extends to any comment on one's own entry.

**Reply (comment reply)** — a response to a comment, forming a one-level thread under it.

**Profile** — a member's public-facing identity: username, avatar, journal title, biography
(rich text), country, member status, entry count, and badges. Distinguishes **own profile** from
another member's. Carries follow/unfollow action flags relative to the viewer.

**User** — a lightweight person reference (username + avatar) used in lists: followers,
following, pending requests, refused followers, people-search results.

**Friendship (follow relationship)** — a **directional** "subscribe" relationship from one
member to another. The viewer's relationship to a profile/entry owner is expressed as
follow/unfollow availability and a relationship state. Blipfoto "following" = subscribing to a
journal.

**Award (badge)** — a badge a member has earned (activity/milestone). May be secret until earned.
Shown on profiles and explained in the icon guide.

**Tag** — a free-text label on an entry; tapping a tag lists other entries with that tag.

**Notification** — an item in the notifications inbox: someone starred, favourited, followed,
requested to follow, hit a milestone, or earned an award (comments received have their own inbox).
Carries **pre-rendered content**, an optional image, and a link to its target — and notably *not* an
activity type, an author, or a timestamp, which is why the app infers the destination from the link
and can only recognise the member responsible from the text. See
[api-appendix/data-model.md](api-appendix/data-model.md).

**Push** — a message from the cloud notification service saying that an unread total has risen, and
by how much. Distinct from a notification: it carries no activity, no target and no member, because
the service cannot read either stream's content without marking it read
([02-notifications.md](02-notifications.md)).

**Advert** — a sponsored slot in an entry grid. The app does not request or display adverts.

---

## Settings & preferences

**User settings** — editable account/profile fields: real name, username, journal title,
biography, country, locale, journal privacy, whether comments are allowed, and discoverability
(find-by-name).

**Notification settings** — per-event toggles in two groups: **feed** notifications and **push**
notifications (comments, stars, favourites, follows, milestones, awards, communications). In the
new app, push toggles govern what the cloud service is permitted to push (see
[02-notifications.md](02-notifications.md)).

**Membership** — a paid tier unlocking extras (e.g. square thumbnail cropping). Gates some UI.
The app **reads** the signed-in member's status to gate member-only features but does **not** sell
or manage membership (that happens on Blipfoto web).

---

## Accounts, sign-in & tokens

**Account** — a Blipfoto identity the user has signed into and the app has stored. The app may
hold **several at once**; each keeps its own sign-in mode and its own token(s), independently.

**Active account** — the one account, of those stored, whose credentials every account-specific
screen currently uses. Exactly one is active at a time; switching is instant and local
(`FLW-21`). Having none active is **anonymous browsing**. With two or more accounts stored, a
persistent avatar in the nav chrome always shows which one and opens a quick switcher — see
[rules.md](rules.md) (Multi-account clarity).

**Sign-in mode** — how a given account is signed in: **read-only** or **read-write**, each with
notifications on or off, giving four modes. Chosen at sign-in and changeable per account later
(`SCR-30`, `FLW-22`). Full model in [api-appendix/auth.md](api-appendix/auth.md).

**Read-only account** — an account whose token can read everything it could normally see but
cannot write anything: no posting, editing, deleting, starring, favouriting, commenting,
following, approving, or changing settings. The app **hides** write affordances for such an
account rather than letting them fail.

**Read-write account** — full access; required for every write action.

**Token** — the credential obtained by signing in, used as the bearer on API calls. Effectively
indefinite until revoked, so there is no refresh step. An account holds **one or two**: its own
token, plus — in read-write + notifications mode — a separate read-only token handed to the
notification service.

**Needs-reauth** — the state of an account that has lost a token to a forced logout but has not
been removed. It stays in the account list and can be repaired by re-authorizing just the missing
token (`SCR-30`, `FLW-22`).

**Gated action** — an action requiring an account, triggered while anonymous. The app offers
sign-in and then resumes the original action (`FLW-01`).

**Cloud notification service** — the separate backend that polls Blipfoto on the user's behalf
with their read-only token and delivers pushes to the app, because Blipfoto's own push mechanism
is unavailable here. See [02-notifications.md](02-notifications.md).

## States, flags & rules

**Action flags** — per-object booleans from the server saying what the current viewer may do
(e.g. an entry's comment/star/favourite/edit/delete permissions; a profile's follow/unfollow).
The UI shows affordances based on these, not on guesses.

**Privacy-protected (private) account** — an account whose entries are visible only to approved
followers; follow requests must be approved (see **pending request**).

**Pending request** — a follow request awaiting the target member's approval (only for protected
accounts). Approved or refused on `SCR-20`.

**Hidden member** — a member whose content this account has chosen not to see. Their entries,
comments and notifications are suppressed everywhere in the app. Held **on the device**, per
account; changes nothing server-side, and the hidden member is never told. Managed on `SCR-31`.
**Stops you seeing them. Does not stop them seeing you.**

**Refused follower** — a member whose **follow request** was refused (`SCR-20`), leaving them
unable to see a protected journal. Enforced server-side. Managed on `SCR-21`. **Stops them seeing
you. Does not stop you seeing them.**

> Refusing a request is the *only* way someone becomes a refused follower. **Removing an existing
> follower** (`SCR-19`) is a different, weaker operation: it ends the relationship but does not
> refuse them, and they never appear on `SCR-21`. On a protected journal they can send a fresh
> follow request, which the owner may then approve or refuse.

> These are two separate features pointing in opposite directions, and a member may be either,
> both, or neither. The app never uses the word *block* for either one, because it would promise
> a mutual cut-off that neither delivers alone. See [rules.md](rules.md).

**Publish eligibility** — whether the member may publish an entry for a given date (enforces the
one-per-day rule). Checked before composing; a date may be ineligible for several reasons (e.g.
already posted that day, future date, protected) each with its own message.

**Unread count** — number of unread items in the notifications or comments inbox; shown as a
badge, cleared on opening the inbox, refreshed on a new push.

**Forced logout** — a backend signal that a **specific token** is no longer valid. The app clears
only that token, never every stored account: the affected account moves to **needs-reauth**, and
the user is only returned to a logged-out state if that was the last usable token of the only
account. See [rules.md](rules.md) and `FLW-02`.

**Optimistic update** — a UI change applied immediately (e.g. star +1, follow) before the server
confirms; reconciled afterward, with an error message but generally no revert on failure.

**Deep link** — an external link (web URL or custom scheme) or push target that opens a specific
entry or profile directly.

**Share-to-Blipfoto** — the OS share action delivering a photo to the app, which lands the user
in the compose flow (sign-in gated).

**Logged-out (anonymous) browsing** — viewing public content without an account, using an
app-level credential rather than a user session.
