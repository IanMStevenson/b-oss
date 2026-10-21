# Play Console: answers for b-mobile

What to enter in each Play Console form, so the repo (not an issue thread) is the record. Public
repo: **no credentials here**; the demo account's password lives in the password manager and goes
only into the Console. Update this file as each form is completed (note what was actually
entered). Related: `listing.md` (store text and graphics), `../docs/play-data-safety.md` (Data
safety), `../docs/RELEASING-android.md` (building and uploading).

## App details

| Field               | Value                                                                                |
| ------------------- | ------------------------------------------------------------------------------------ |
| App name            | b-mobile for Blipfoto                                                                |
| Package name        | `uk.co.salientpoint.bmobile` (set by the first bundle; permanent)                    |
| Default language    | English (United Kingdom)                                                             |
| App or game / price | App, free                                                                            |
| Category            | Photography (not Social: Social brings in Child Safety Standards declarations)       |
| Contact email       | b-oss@salientpoint.co.uk (public)                                                    |
| Website             | https://ianmstevenson.github.io/b-oss/b-mobile.html (live when the site page merges) |
| Privacy policy      | https://ianmstevenson.github.io/b-oss/b-mobile-privacy.html                          |
| Data deletion URL   | https://ianmstevenson.github.io/b-oss/b-mobile-data-deletion.html                    |

## App access (restricted: needs a sign-in)

Choose "All or some functionality is restricted" and add one instruction set. Credentials: the
demo account `bmobiledemo`, password from the password manager (Play needs credentials that stay
valid and work from any location).

> b-mobile for Blipfoto is a client for the Blipfoto photo journal. Most screens need a Blipfoto
> account.
>
> 1. Open the app. It starts on Browse (no sign-in needed to look around). Open the menu and tap
>    **Sign in** (the last item), then choose **Read-write**.
> 2. The Blipfoto sign-in page opens. Username: `<demo username>`, password: `<demo password>`.
>    Approve access when asked. (Turning on notifications later asks for one more sign-in to the
>    same account; it is optional.)
> 3. You can then browse (Recent, Popular, Following, Nearby), open an entry, star, favourite and
>    comment, search, open the map, and post a new entry from the **New entry** menu item (camera
>    or photo picker).
> 4. To try reporting and blocking: open another member's entry. **Report** and **Hide user** are
>    in the star/favourite bar and again as links at the foot of the page. A report is sent to
>    Blipfoto's moderators; **Hide user** hides that member in the app.
> 5. Notifications are optional (Settings, Notifications) and reflect activity from other
>    members, so none may arrive during review. The daily reminder (Settings) can be set a minute
>    or two ahead; it may arrive a few minutes late.
>
> Permissions are asked for only when used: camera (take a photo), location (my location,
> Nearby), notifications.

## Ads

No ads.

## Target audience and content

- Target age: **18 and over** (Ian, 2026-10-21). Not designed for or appealing to children; not a
  Families app.
- No sexual content or nudity (Blipfoto allows none), which also answers the sexual-content
  parts of the content rating.

## Content rating (IARC questionnaire)

Answer each question as asked and record the questionnaire's category and the rating that
results below. Decided so far:

- Violence, sexual content, language, controlled substances, gambling: none.
- Users can interact and share user-generated content: **yes** (comments, entries, follows;
  report and hide are built in).
- Digital purchases: no.
- **Shares the user's current and precise location with other users: yes.** A user can attach a
  precise location to an entry, including their current position through "my location", and that
  location is shown to other people on Blipfoto and on the app's map. It is chosen per entry by
  the user, not sent in the background. Answering yes is the conservative reading, and matches
  the privacy policy and the Data safety answers. (The effect is an interactive-element notice
  such as "Shares location", not a higher age rating.)

## Data safety

Answers and reasoning: `../docs/play-data-safety.md`. The deletion URL is above.

## Other declarations

- Health: none. Financial features: none. Government app: no. News app: no.
- Advertising ID: the app does not use it (it declares no `AD_ID` permission).
- Permissions: camera, approximate and precise location (foreground, at point of use),
  notifications. No storage or photo-library permissions (the system photo picker is used), no
  exact alarms. From 27 January 2027 Play asks for a location declaration; decide then whether
  entry tagging needs precise location or approximate location is enough.
- Target API 36, as required for new apps.

## Store listing

Text, category and graphics are in `listing.md` and `graphics/` (icon, feature graphic, four phone
screenshots). EU trader details (address, phone) are entered in the Console account settings; only
the contact email above is recorded here.

## Testing and release

First release goes to **Internal testing** (signed bundle from the release workflow; see
`../docs/RELEASING-android.md`). Whether the account must run a closed test before production
access depends on the account type; record what the Console says here once known.
