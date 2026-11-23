# Compose and edit state (b-oss#1056)

Why this exists: three bugs of one class (the edit screen lost its photo after the map screen; an
entry's extras showed a stale "web sign-in needed"; an extra photo added on the edit screen vanished
after the map screen). All came from the same fact, set out first.

## The fact that causes the class

`renderAppRoutes` gives `IonRouterOutlet` one catch-all route (see `data/resumeCache.ts`), so opening
a screen **unmounts** the one behind it and Back **rebuilds** it. Every round trip (map picker,
replace-photo screen, a sign-in) is a remount. So:

- Component state, refs and effects' results are gone after any round trip.
- Anything that **seeds on mount** runs again and can overwrite what the member did.
- Anything **gated on a per-mount read** (membership, the website read of the edit page) is hidden
  again until that read answers, and for good if it fails.

## Where each KIND of state belongs

| Kind                                                                                                                                      | Home                                                                          | Rule                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| What the member typed or chose for this entry                                                                                             | `composeDraftStore` (`patchDraft`, dirty)                                     | Never in component state. Screens read it with a selector and write it back at once.                        |
| What the server/website said about this entry, which the screen shows (entry photo, current extras, allowance, edit level, original date) | `composeDraftStore` (`patchLoaded`, not dirty)                                | Written once when read; a remount reads it back instead of reading again. Only successful reads are stored. |
| Facts about the account, not the draft (membership)                                                                                       | `data/resumeCache.ts`, keyed by account, shown at once, re-checked each mount | A failed re-check keeps the last answer.                                                                    |
| Transient UI of one screen instance (spinners, open alerts, error captions, which dialog is up, `submitting`)                             | component state / refs                                                        | Losing it on remount must be harmless: nothing the member chose, nothing a read produced.                   |
| Whether the website session is this member's                                                                                              | the host (site-session), asked each time                                      | `useSiteSignInGate`'s `signedIn` ref is only a per-mount shortcut to skip a re-check.                       |
| Entry lists, extras of an entry being _viewed_                                                                                            | `resumeCache` (TTL 10 min)                                                    | `forgetEntryExtras()` after anything that changes extras or the session.                                    |
| Photo bytes                                                                                                                               | blob URL (desktop) / file URI (Android), in the draft                         | Never revoked while the page lives (see below).                                                             |

Two further rules:

1. **A display must not depend on a read for what the member already decided.** Unsaved extras are
   shown whatever the membership check or website read is doing (`ExtraPhotosEditor`
   `pendingAdditions`; the extras block is mounted whenever `draft.extras` is non-empty).
2. **A seed never overwrites.** `seedEditDraft` is a no-op when this entry's edit draft exists. A
   screen that writes to the draft with none present must leave (`NewEntryScreen` replace mode and
   `LocationPickerScreen` do), because `patchDraft` with no draft silently does nothing.

A new draft field: add it to `ComposeDraft`, then to `DRAFT_FIELD_KIND` (compile error otherwise) and to
`FIELD_CASES` in `state/__tests__/composeRoundTrips.test.tsx` (compile error otherwise): how to set it
and what must be visible after every round trip. The matrix then covers it on new entry and edit.

## Inventory

### Draft store (`state/composeDraftStore.ts`, zustand, in memory)

Created by SCR-09 `startDraft` (publish) or SCR-13's load (`seedEditDraft`, edit). Cleared by Back/Home
with no changes, Discard, a successful save/publish, delete, and the picker's Discard. A remount does
nothing to it. A page refresh loses it (by design: no persistence).

| Field                                        | Kind     | Written by                                                                 |
| -------------------------------------------- | -------- | -------------------------------------------------------------------------- |
| `mode`, `accountId`, `entryId`, `dirty`      | identity | creation; `dirty` set by `patchDraft`                                      |
| `editLevel`, `originalDate`, `existingImage` | loaded   | SCR-13 load                                                                |
| `siteExtras` (current extras + allowance)    | loaded   | `ExtraPhotosEditor` / `ExtraPhotosSection` after a successful website read |
| `photo`, `thumbnailCrop`                     | input    | SCR-09 (publish) / replace-photo screen (edit); crop by the frame          |
| `title`, `tags`, `description`, `date`       | input    | the form                                                                   |
| `location`, `displayLocation`                | input    | SCR-12 Done; the toggle; SCR-13 "Add to map" lookup (`location` only)      |
| `extras`, `extrasRemove`                     | input    | the extras blocks                                                          |

### Component state and refs (all transient, safe to lose)

SCR-13: `loading`/`loadError`/`loadAttempt`, `submitting`, `submitError`, `extrasState` (outcome after
save: the draft is already cleared then), the three alert flags, `lookingUpPosition`, `mapMessage`,
`pendingHome`, `hasSeededRef` (initialised from "a draft for this entry exists", never re-armed).
SCR-10: `eligibility*`, `unusablePhoto` (recomputed on mount from the draft's photo), `submitting`,
`published` (after publish the draft is cleared; a remount there redirects to SCR-09). SCR-12:
`selected` (an unconfirmed pin, lost on purpose: Done commits) and the Leaflet refs. Extras blocks:
`loaded` (initialised from the draft), `notice`, `attempt`; the gate's dialogs and `signedIn`.

### Caches and module variables

`resumeCache` (10 min): `membership:<account>` (new), `extras:<account>:<entry>` (viewing only; the edit
screen no longer uses it), feed positions. Module: `inFlight` in `entryExtras.ts` (de-dup only).

### Website session (host)

Cookies live in the shell/plugin. Nothing in the app holds them. A sign-in window does not unmount the
screen on desktop (a separate window); on Android the activity returns to the same WebView. Either way
the draft is untouched; a sign-in only calls `forgetEntryExtras()` and re-reads.

### Server

Entry fields, extras on the website. Read on SCR-13's first load and the extras block's first read;
not re-read on a round trip (Save re-reads the edit page before sending, `applyExtras`).

## Photo blob URLs

Desktop `pickPhoto` returns `URL.createObjectURL(blob)`. It is created once, held in the draft, and **not
revoked** by anything while the page lives, so it survives navigation and a remount. It must not be
revoked on `clearDraft`: after Save the extras are still read from `webPath` (`photoToExtraFile`).
Cost: memory for each picked photo until the window reloads. A refresh drops all blob URLs and the draft
together, so they never dangle.

## What a round trip does to each field (tested)

The matrix runs the real screens through: location picker (Done / Back), replace-photo screen (Back /
pick again), leave-and-Keep-editing, a plain remount, a website sign-in (new entry gate; edit "Sign in to
see extras"), and a refresh (draft lost: edit re-seeds from the server, new entry returns to SCR-09), on
new entry and edit, with every `ComposeDraft` field set first. Not covered: SCR-11 is the biography
editor now and holds no compose state; the crop gesture (react-easy-crop) is set through the store.

## Known gaps (follow-up, not in this change)

- A new entry or an edit **replaces** any other draft without asking (`setDraft` in SCR-09; `seedEditDraft`
  for a different entry), so reaching them from the menu mid-edit drops the other draft silently.
- Blob URLs are never revoked (above).
- A refresh loses an unsaved draft; whether to persist it is a product decision.
