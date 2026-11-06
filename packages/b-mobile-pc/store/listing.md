# b-mobile (Windows) — Microsoft Store content

Source of truth for the text pasted into Partner Center, so what is published can be
reproduced and updated. Tracked in
[b-oss#880](https://github.com/IanMStevenson/b-oss/issues/880), part of the b-mobile-pc epic
[b-oss#605](https://github.com/IanMStevenson/b-oss/issues/605); modelled on
`packages/b-ark/store/listing.md` ([b-oss#805](https://github.com/IanMStevenson/b-oss/issues/805)).
Limits are the ones Partner Center states for each field. Screenshots live in `screenshots/` beside this
file and are uploaded directly.

Run `node scripts/check-store-listing.mjs packages/b-mobile-pc/store/listing.md` (repo root) after any
edit: it reads the fenced blocks under the headings below and fails if a limit is exceeded. Keep each
field's text in the first fenced block under its heading.

**DRAFT.** All content questions are answered; the screenshot and the MSIX build are outstanding. A marker `IAN TO CONFIRM` would flag any new question; the checker fails the final run
(`STORE_LISTING_FINAL=1`) while any marker remains in the description or certification notes.

---

## Submission options → restricted capability: `runFullTrust`

"Why do you need the runFullTrust capability, and how will it be used in your product?"

Keep this under 450 characters.

```
b-mobile is an Electron desktop app (Chromium and Node.js), a Win32 program that cannot run in the AppContainer sandbox. Full trust lets it run a tray icon, check for new Blipfoto comments and activity in the background, start at sign-in when notifications are on, and protect the Blipfoto access token with Windows' credential protection. It runs unelevated and installs no services. Open source: github.com/IanMStevenson/b-oss
```

## Store listing (English)

Product name: **b-mobile for Blipfoto** (Ian, 2026-11-06; same as the Play listing). Reserve it in Partner Center; the identity name comes from there. The MSIX target is being built in another session.

### Short description (recommended under 270 characters)

```
Browse, post and get notified on your Blipfoto journal from your Windows PC, with several accounts. The b-mobile app, on the desktop. Independent and open source.
```

### Description (plain text, up to 10,000 characters; no HTML, code or URLs)

```
b-mobile is an app for Blipfoto, the photo journal where you post one picture a day. This is the Windows version of the b-mobile Android app: the same screens and the same way of working, in a window on your PC.

b-mobile is completely free to use, with no ads and no in-app purchases. It works with your existing Blipfoto account, whatever kind it is; any paid Blipfoto features are between you and Blipfoto, and are separate from this app.

Sign in with your Blipfoto account and you can:

Browse
- Recent, Following, Popular, Milestones, New Blippers and Nearby, all in one place.
- Search entries and people.
- Explore entries on a map.

Post
- Choose a photo from your PC, or take one with your webcam.
- Add a title, description, tags and a location (pick the place on a map, or use your PC's location if you allow it).
- Choose your thumbnail, and see a confirmation when your entry is published.

Join in
- Star and favourite entries.
- Comment, reply, edit and delete your own comments.
- Follow other Blippers, and approve or refuse requests to follow you.

Stay in touch
- Optional Windows notifications for new comments and activity. b-mobile checks Blipfoto every few minutes and tells you when something new arrives, even with the window closed.
- When notifications are on, b-mobile starts with Windows and waits quietly in the system tray. Closing the window hides it; use Exit in the tray menu to quit.
- A daily reminder to post, at a time you choose.
- Open Blipfoto links in the app, if you want to.

Your accounts
- Sign in with more than one Blipfoto account and switch instantly.
- Read-only or read-write sign-in, your choice.

In control
- Hide members you would rather not see.
- Report entries, comments and members that break Blipfoto's rules.

Privacy
- No ads, no analytics, no tracking, and no server of ours in the way.
- Your sign-in token is protected with Windows' own secure storage.
- Photos and text go straight between your PC and Blipfoto.

Good to know
- Images are shown at standard size. Extra images and full-size (original) downloads are not available to apps using Blipfoto's programming interface, so b-mobile cannot show or save them.
- Notifications on the PC are checked every few minutes while b-mobile is running (it can run from the tray); if you exit it, they stop until you start it again.

b-mobile is a free, open-source project led by Ian Stevenson. It is independent and unofficial: it is not made, endorsed or supported by Blipfoto. It uses Blipfoto's public programming interface, and your use of Blipfoto is governed by Blipfoto's terms of service. You need a Blipfoto account to use it. Updates come through the Microsoft Store.
```

Claims checked against `packages/b-mobile/docs/BEHAVIOUR.md`, `PLATFORM-MATRIX.md` (desktop: webcam capture, pick-only location, polling every 5 minutes) and `packages/b-mobile-pc/README.md`. The daily reminder to post is included because Ian says it is implemented on desktop and will be in the release before it is published (2026-11-06); re-check once it has merged. Remove the markers before pasting.

### Product features (up to 20, each up to 200 characters; one per line, no bullets: the Store adds them)

```
The b-mobile Blipfoto app on your Windows PC: browse, search and explore entries on a map
Post entries from a photo on your PC or your webcam, with title, description, tags and location
Star, favourite, comment and reply, and follow other Blippers
Sign in with several Blipfoto accounts and switch instantly
Optional Windows notifications for new comments and activity, plus a daily reminder to post
Starts with Windows when notifications are on; closing the window keeps it in the tray
Read-only or read-write sign-in, your choice
Hide members and report entries, comments and members
Sign-in token protected with Windows secure storage; no ads, no analytics
Free, open-source and independent of Blipfoto
```

### What's new in this version

Leave blank for the first submission.

### Notes for certification testers

Partner Center's "Notes for certification" field. Its character limit was not confirmed from Microsoft's docs; the checker holds this to 1,500 characters to be safe.

```
b-mobile is a client for a user's own Blipfoto photo journal, so it needs a Blipfoto account and an internet connection; without one only the sign-in screen is visible. Test-account details, if any, go in this field in Partner Center only, never in this repository.

What to expect: on first launch b-mobile shows a short explanation and a sign-in button. Sign-in opens a separate window on Blipfoto's authorisation page; after approving, that window closes and the account's feed appears. Browsing, search and the map need no further setup. Settings > Notifications turns on Windows notifications; that makes b-mobile start with Windows and keep running in the system tray when its window is closed (Exit in the tray menu quits). "Send a test notification" there shows a toast at once.

No other sign-in, purchase, advertising or network service is involved: the app talks only to Blipfoto and its map tile provider. The restricted capability runFullTrust is needed because b-mobile is an Electron (Win32) desktop app that runs a tray icon and background checks for new activity, starts at sign-in when the user enables notifications, and uses Windows credential protection for the token; it runs unelevated and installs no services.
```

### Category and ratings (suggestions; confirm against the Partner Center dropdowns)

- Category: **Photo & video** (Ian, 2026-11-06, as for b-ark; the b-ark section above says Productivity, which was only a suggestion).
- Age rating: complete the IARC questionnaire honestly. Unlike b-ark this app **lets users post and read user-generated content** (photos, comments, profiles) and interact with other users (comments, follows), and shows content from other members. Answer the user-generated-content and user-interaction questions the form's wording requires, including that users can report and hide members. Expect a rating above the lowest tier; let the questionnaire decide. Ian (2026-11-06): use the same answers as the Play content rating.
- Pricing: free. Markets: all (Ian, 2026-11-06).
- Support contact / website: `b-oss@salientpoint.co.uk` (the address on the Android listing); website `https://b-oss.dev/b-mobile` (Ian, 2026-11-06).

### Privacy policy URL (its own field, not part of the description)

```
https://b-oss.dev/b-mobile-privacy
```

The shared b-mobile policy now has a "b-mobile on Windows" section (token in Windows credential protection, notifications polled from the PC with no b-push or Firebase, webcam, location, maps, Store updates). Ian chose to fix it in this PR (2026-11-06).

### Screenshots

Uploaded in Partner Center, from `screenshots/`: PNG, 1366x768 or larger (up to 3840x2160), up to 10 per listing, 4 recommended. These must be of the real app showing real photos and thumbnails.

Ian will take the screenshot on Windows via Mutagen (2026-11-06); for this first submission one is enough:

| File           | Shows                                          |
| -------------- | ---------------------------------------------- |
| `1-browse.png` | A feed grid in the desktop layout, real photos |

### Still needed

- The MSIX target is being built in another session; the identity and the runFullTrust text above depend on it. The Store handles updates, so the in-app updater (b-oss#612) must be off in that build.
- Store logos (the Android 512 px icon is `packages/b-mobile/store/graphics/icon-512.png`); a trailer is optional.
