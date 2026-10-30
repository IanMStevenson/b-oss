# Play Data safety form: draft answers

Draft for the Play Console "Data safety" section (b-oss#361). Keep it in step with the privacy
policy (`docs/b-mobile-privacy.html`, served from GitHub Pages) and re-check it on every release
that changes what leaves the device. Not yet entered in the Console (the developer account is
unverified), so wording of options below is from memory of the form; confirm against the live one.

## Ground rules used

- "Collected" = transmitted off the device by the app, **whoever receives it** (Google's
  definition: [Data safety help](https://support.google.com/googleplay/android-developer/answer/10787469)).
  So what Blipfoto, Geoapify or Google do with data afterwards doesn't change whether the app
  collected it, and we don't describe their practices here. Data only processed on the device
  (tokens, settings, hidden list, cache, drafts, queue) is **not** collected.
- **Ephemeral** = only held in memory and kept no longer than the specific real-time request
  needs. Ephemeral data must still be answered in the form but isn't shown to users on the
  store page. We answer **not ephemeral** throughout: Blipfoto stores entries, comments, photos
  and profile fields, we cannot vouch for what it logs for searches or location queries, and
  our own b-push records are stored.
- **App interactions**: declared (required). Every request the app makes (viewing an entry,
  browsing a feed) tells the receiving service what the user looked at, and the app sends it. We
  collect no analytics of our own; this is the conservative reading, since over-declaring is
  harmless and under-declaring is the risk.
- The app is a client for Blipfoto. Requests the user triggers to the service they signed in to
  (post, comment, upload, nearby search) are treated as user-initiated transfers, not
  "sharing". **This is a judgement call to confirm**: if Google's reading is stricter, the
  "Shared" answers marked ⚠ below flip to Yes.

## Answers

| Question                                       | Answer                                                    |
| ---------------------------------------------- | --------------------------------------------------------- |
| Does the app collect or share user data?       | Yes                                                       |
| Is all data encrypted in transit?              | Yes (HTTPS to Blipfoto, Geoapify, b-push, FCM)            |
| Can users request data deletion?               | Yes: see the data deletion page below                     |
| Account creation / sign-in inside the app?     | Sign-in with a Blipfoto account (OAuth); links to sign-up |
| Independent security review                    | No                                                        |
| Follows Families policy / directed at children | No                                                        |

## Data types

| Category / type                                                                                             | Collected | Shared | Optional      | Purpose           | Notes                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------- | --------- | ------ | ------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Personal info: **Name**                                                                                     | Yes       | No ⚠   | Yes           | App functionality | Settings, General: the real name the user chooses to show on their Blipfoto account, sent to Blipfoto only when edited |
| Personal info: **Other info**                                                                               | Yes       | No ⚠   | Yes           | App functionality | Country, language and biography the user edits in Settings, General and Profile, sent to Blipfoto only when edited     |
| Personal info: email, address, phone, race or ethnicity, political or religious beliefs, sexual orientation | No        | No     |               |                   | Never asked for or sent (the app also never writes Blipfoto's email or push preferences)                               |
| Personal info: **User IDs**                                                                                 | Yes       | No     | Yes           | App functionality | Blipfoto user ID in the b-push record; only if notifications are on                                                    |
| Device or other IDs                                                                                         | Yes       | No     | Yes           | App functionality | FCM push token in the b-push record; only once notifications are turned on                                             |
| Location: **Approximate location**                                                                          | Yes       | No ⚠   | Yes           | App functionality | Nearby search and entry location go to Blipfoto; map area to Geoapify                                                  |
| Location: **Precise location**                                                                              | Yes       | No ⚠   | Yes           | App functionality | As above when precise access is allowed; also camera photos' EXIF location, uploaded with the photo (b-oss#395)        |
| Photos and videos: **Photos**                                                                               | Yes       | No ⚠   | Yes           | App functionality | Photos the user posts, uploaded to Blipfoto unchanged (EXIF included); nothing to the developer                        |
| App activity: **Other user-generated content**                                                              | Yes       | No ⚠   | Yes           | App functionality | Comments, entry titles, descriptions and tags posted to Blipfoto                                                       |
| App activity: **App interactions**                                                                          | Yes       | No ⚠   | No (required) | App functionality | Requests for entries, feeds and profiles reveal what the user viewed; no analytics of our own                          |
| App activity: **In-app search history**                                                                     | Yes       | No ⚠   | Yes           | App functionality | Search terms sent to Blipfoto to run the search                                                                        |
| App activity: **Other actions**                                                                             | Yes       | No ⚠   | Yes           | App functionality | Stars, favourites, follows, follow approvals and reports sent to Blipfoto                                              |
| Messages                                                                                                    | No        | No     |               |                   | No messaging between users in the app; comments are under App activity                                                 |
| Web browsing history                                                                                        | No        | No     |               |                   | No analytics                                                                                                           |
| Crash logs / diagnostics                                                                                    | No        |        |               |                   | None of ours. Play may add Android vitals independently                                                                |
| Financial, health, contacts                                                                                 | No        |        |               |                   |                                                                                                                        |

Firebase Cloud Messaging (Google's SDK in the app) also creates a Firebase installation ID and push
token on the device once notifications are turned on (auto-init is off until then, b-oss#392), and
may log delivery data itself. Only the push token reaches the developer (the b-push record); the
rest is Google's. The Device or other IDs row covers this, and the answer should stay Yes while
push is in the app.

Per Firebase's [Play data disclosure page](https://firebase.google.com/docs/android/play-data-disclosure),
the Cloud Messaging SDK also sends the app version and a "Firebase user agent" (OS version, device
model and brand, the installing app, SDK versions) to Google, and uses a Firebase installation ID.
Google's page does not map these to Play data types. Decision (Ian, 2026-10-21): declare **Device
or other IDs** (installation ID and push token) and answer **No** to Crash logs, Diagnostics and
Other app performance data; the device-metadata flow is described in the privacy policy's
Firebase paragraph. If Play ever asks, Diagnostics (collected, not shared, optional, app
functionality) is the closest category to declare.

The Blipfoto read token stored by b-push is a credential, not a listed data type; it is encrypted
at rest and covered under User IDs in the policy.

## Data deletion

- **Data deletion URL:** `https://b-oss.dev/b-mobile-data-deletion.html`
  (`docs/b-mobile-data-deletion.html`, b-oss#403).
- The b-push record is deleted by turning notifications off or disconnecting the account in the
  app (immediate), and automatically after uninstall. Everything else the app holds is on the
  device and removed on uninstall, apart from photos the user downloaded (Android 10+).
- Content on Blipfoto (account, entries, photos, comments) is deleted through Blipfoto; the
  page and the app's Accounts → Delete account both lead to Blipfoto's account settings.

## Other declarations to answer consistently

- **Ads:** none. **Target audience:** adults/general, not children.
- **Permissions:** camera (take a photo), approximate/precise location (my-location, Nearby),
  post notifications. No storage, contacts, SMS, or exact alarms.
- **App access:** reviewer needs a Blipfoto login (b-oss#363).
- **User-generated content:** yes: reporting and blocking (b-oss#362). Where the form asks about
  users accepting terms: sign-up and authorisation happen on Blipfoto.
