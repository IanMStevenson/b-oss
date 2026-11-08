# b-mobile for Blipfoto: Google Play listing copy

> **Maintainer-only.** This is how the maintainer publishes the Google Play listing, using their own accounts and credentials.
> Agents: it applies only if `hostname` starts with `ims-dev-` (see [MAINTAINER-ENVIRONMENT.md](../../../docs/MAINTAINER-ENVIRONMENT.md)).
> Otherwise you are a contributor: don't act on it, but feel free to use it as a model.

Source of truth for the text fields in the Play Console (b-oss#364). Keep in sync with what is
published. Image assets are listed at the end; they are uploaded in the Console, not hosted.
Matches the privacy policy (`docs/b-mobile-privacy.html`), the data deletion page
(`docs/b-mobile-data-deletion.html`) and the Pages site (`docs/b-mobile.html`).

## App name (≤ 30 characters)

b-mobile for Blipfoto

## Short description (≤ 80 characters)

Browse, post and get notified on your Blipfoto journal from your phone.

## Full description (≤ 4000 characters)

b-mobile is an Android app for Blipfoto, the photo journal where you post one picture a day.

b-mobile is completely free to use, with no ads and no in-app purchases. It works with your existing Blipfoto account, whatever kind it is; any paid Blipfoto features are between you and Blipfoto, and are separate from this app.

Sign in with your Blipfoto account and you can:

BROWSE
• Recent, Following, Popular, Milestones, New Blippers and Nearby, all in one place
• Search entries and people
• Explore entries on a map

POST
• Take a photo or choose one from your gallery
• Add a title, description, tags and a location
• Choose your thumbnail, and see a confirmation when your entry is published
• Switch maps to a satellite view

JOIN IN
• Star and favourite entries
• Comment, reply, edit and delete your own comments
• Follow other Blippers, and approve or refuse requests to follow you

STAY IN TOUCH
• Optional notifications for new comments and activity
• A daily reminder to post, at a time you choose
• Open blipfoto.com links in the app, if you want to

YOUR ACCOUNTS
• Sign in with more than one Blipfoto account and switch instantly
• Read-only or read-write sign-in, your choice

IN CONTROL
• Hide members you would rather not see
• Report entries, comments and members that break Blipfoto's rules

PRIVACY
• No ads, no analytics, no tracking
• Your sign-in is kept in your phone's secure storage
• Optional notifications service under your own control

GOOD TO KNOW
• Images are shown at standard size. An entry's extra images are shown too. Full-size (original) downloads and adding extra images are not available to apps using Blipfoto's API, so b-mobile can't save or add them. You can download the display-size photo of your own entries.

b-mobile is an open-source project led by Ian Stevenson, published on Google Play on behalf of the development team by Salient Point Consulting Ltd. It is an independent app built on Blipfoto's public API, and is not affiliated with or endorsed by Blipfoto. Use of Blipfoto is governed by Blipfoto's terms of service.

Source code: https://github.com/IanMStevenson/b-oss
Privacy policy: https://b-oss.dev/b-mobile-privacy.html

## Other store fields

- **Category:** Photography. **Tags (chosen from Play's list):** Photography, Social. The Social tag fits ("facilitate social networking, sharing"); Play's Child Safety Standards policy is scoped by declared category, not tags.
- **Contact email:** b-oss@salientpoint.co.uk (public on the listing; also the trader contact, b-oss#365).
- **Website:** `https://b-oss.dev/b-mobile.html`.
- **Privacy policy URL:** `https://b-oss.dev/b-mobile-privacy.html`.
- **Data deletion URL** (Data safety → Data deletion):
  `https://b-oss.dev/b-mobile-data-deletion.html`.
- **Price / monetisation:** Free; contains ads: No; in-app purchases: No.
- **Default language:** English (United Kingdom).

## Graphics

| Asset               | Spec                         | Status                                                              |
| ------------------- | ---------------------------- | ------------------------------------------------------------------- |
| App icon            | 512×512 PNG, ≤ 1 MB          | Done: `store/graphics/icon-512.png`                                 |
| Feature graphic     | 1024×500 JPG/PNG             | Done: `store/graphics/feature-graphic-1024x500.png`                 |
| Phone screenshots   | 2–8, 9:16, ≥ 1080 px         | First set: `store/graphics/screenshots/` (4, from the demo account) |
| Tablet screenshots  | Optional (7- and 10-inch)    | Not provided (decision 2026-10-21); add later if wanted             |
| Themed (monochrome) | Optional adaptive-icon layer | Done: `ic_launcher_monochrome` in the Android project               |

## What's new (release notes, ≤ 500 characters)

### 1.2.0

```
New: satellite view on the Map and when picking a location.

Changed:
• Publishing is now immediate and ends with a confirmation screen. There is no upload queue or Uploads screen any more.
• The menu is reordered, with icons, your account at the top and the version at the bottom.
• Settings is regrouped: Appearance, Reminders, Details & journal.
• Settings and Help always show a back arrow.

Fixed: default thumbnail crop, and clearer errors when publishing fails.
```

### 1.2.1

```
Fixed: tapping a tag now lists its entries. When something can't load, you now get a clear message (offline, or Blipfoto not answering) with Try again and a link to the status page.
```

### 1.2.2

```
Fixed: starred and favourited entries now show as given, the publish confirmation shows your entry's thumbnail, the status bar is green on Android 10 and older, and app links and shared photos work on older devices.
```

### 1.3.0

```
New: a bottom bar to step through the grid you opened an entry from, and tap a profile picture to see it full size. Notifications and comments now refresh when you return to the app, and the publish confirmation thumbnail is centred.
```
