# b-ark — Microsoft Store content

Source of truth for the text pasted into Partner Center, so what is published can be
reproduced and updated. Tracked in
[b-oss#805](https://github.com/IanMStevenson/b-oss/issues/805). Limits are the ones
Partner Center states for each field. Screenshots and any logos are uploaded directly and
will live beside this file.

---

## Submission options → restricted capability: `runFullTrust`

"Why do you need the runFullTrust capability, and how will it be used in your product?"

The box cuts the text off at roughly 500 characters, so keep this under 450.

```
b-ark is an Electron desktop app (Chromium and Node.js), a Win32 program that cannot run in the AppContainer sandbox. Full trust lets it write the user's backup to a folder they choose anywhere on their PC, run a tray icon and scheduled background backups, start at sign-in, and encrypt the Blipfoto access token with Windows' credential protection. It runs unelevated and installs no services. Open source: github.com/IanMStevenson/b-oss
```

## Store listing (English)

Product name: **b-ark** (reserved name; identity `IanStevenson.b-ark`)

### Short description (recommended under 270 characters)

```
Back up your Blipfoto journal, entries and photos, to a folder on your own PC, automatically and in the background. An independent, open-source tool.
```

### Description (plain text, up to 10,000 characters; no HTML or URLs)

TODO: adapt from `packages/b-ark-chrome/store/listing.md` once the startup behaviour is final,
so the text describes what the Store build really does.

### Product features (up to 20, each up to 200 characters; do not add bullets)

TODO

### What's new in this version

Leave blank for the first submission.

### Still needed

- Privacy policy URL (a Partner Center field, not part of the description).
- At least one screenshot (four or more recommended).
