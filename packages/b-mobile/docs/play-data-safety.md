# Play Data safety form: draft answers

Draft for the Play Console "Data safety" section (b-oss#361). Keep it in step with the privacy
policy (`docs/b-mobile-privacy.html`, served from GitHub Pages) and re-check it on every release
that changes what leaves the device. Not yet entered in the Console (the developer account is
unverified), so wording of options below is from memory of the form; confirm against the live one.

## Ground rules used

- "Collected" = leaves the device to the developer or a third party. Data only processed on the
  device (tokens, settings, hidden list, cache, drafts, queue) is **not** collected.
- The app is a client for Blipfoto. Requests the user triggers to the service they signed in to
  (post, comment, upload, nearby search) are treated as user-initiated transfers, not
  "sharing". **This is a judgement call to confirm**: if Google's reading is stricter, the
  "Shared" answers marked ⚠ below flip to Yes.

## Answers

| Question                                       | Answer                                                          |
| ---------------------------------------------- | --------------------------------------------------------------- |
| Does the app collect or share user data?       | Yes                                                             |
| Is all data encrypted in transit?              | Yes (HTTPS to Blipfoto, MapTiler, b-push, FCM)                  |
| Can users request data deletion?               | Yes: turn notifications off or disconnect (instant), or contact |
| Account creation / sign-in inside the app?     | Sign-in with a Blipfoto account (OAuth); no account of ours     |
| Independent security review                    | No                                                              |
| Follows Families policy / directed at children | No                                                              |

## Data types

| Category / type                | Collected | Shared | Optional | Purpose           | Notes                                                                 |
| ------------------------------ | --------- | ------ | -------- | ----------------- | --------------------------------------------------------------------- |
| Personal info: **User IDs**    | Yes       | No     | Yes      | App functionality | Blipfoto user ID in the b-push record; only if notifications are on   |
| Device or other IDs            | Yes       | No     | Yes      | App functionality | FCM push token in the b-push record; only if notifications are on     |
| Location: approximate/precise  | Yes       | No ⚠   | Yes      | App functionality | Nearby search and entry location go to Blipfoto; map area to MapTiler |
| Photos and videos              | Yes       | No ⚠   | Yes      | App functionality | Photos the user posts, uploaded to Blipfoto; nothing to the developer |
| Messages / user content        | Yes       | No ⚠   | Yes      | App functionality | Comments, journal text posted to Blipfoto                             |
| App activity, web history etc. | No        | No     |          |                   | No analytics                                                          |
| Crash logs / diagnostics       | No        |        |          |                   | None of ours. Play may add Android vitals independently               |
| Financial, health, contacts    | No        |        |          |                   |                                                                       |

The Blipfoto read token stored by b-push is a credential, not a listed data type; it is encrypted
at rest and covered under User IDs in the policy.

## Other declarations to answer consistently

- **Ads:** none. **Target audience:** adults/general, not children.
- **Permissions:** camera (take a photo), approximate/precise location (my-location, Nearby),
  post notifications. No storage, contacts, SMS, or exact alarms.
- **App access:** reviewer needs a Blipfoto login (b-oss#363).
- **User-generated content:** yes: reporting and blocking (b-oss#362).
