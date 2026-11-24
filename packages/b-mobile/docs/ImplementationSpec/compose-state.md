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
| Photo bytes                                                                                                                               | blob URL (desktop) / file URI (Android), in the draft                         | The draft store owns and revokes blob URLs (see below).                                                     |

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
nothing to it. A page refresh loses it (by design: no persistence; it asks first, see "Leaving an unsaved draft").

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

## Photo blob URLs (b-oss#1058)

Desktop `pickPhoto` returns `URL.createObjectURL(blob)`. The draft holds it in `photo.webPath` / `extras[].webPath`,
so it survives navigation and a remount. **The draft store owns it** (`releaseDropped` in
`composeDraftStore.ts`, the only place that revokes): a blob URL is revoked the moment no photo of the next draft
names it. That covers `clearDraft` (Save, Discard, delete, the picker's Discard), a replaced photo, a removed extra,
and a new draft replacing an old one (`setDraft`, `seedEditDraft`). Android file URIs and other non-`blob:` paths
are left alone.

One exception, by design: a **publish** reads its extras from their blob URLs _after_ the entry is published (the
draft is already cleared by then). `clearDraftKeepingExtras()` revokes the main photo (already uploaded) and hands
back the extras; `ComposeEntryScreen` calls `releasePhotos` on them when `addExtras` settles. The edit Save awaits
`applyExtras` before `clearDraft`, so it needs nothing special. A refresh drops all blob URLs and the draft together.

## Replacing an unsaved draft (b-oss#1057)

Starting a new entry (SCR-09, when the photo is picked) or opening an edit (SCR-13, before it loads) while a
**different draft has unsaved changes** (`dirtyDraftOtherThan`) shows `ReplaceDraftAlert`: "Discard this entry?" /
"Discard changes?" (by the open draft's mode). Discard clears it and carries on; Keep editing goes back to it
(`draftRoute`). A clean draft is replaced silently. The helper and the alert are what the wider "warn before any
navigation away" guard (b-oss#1059, next section) reuses. Only Discard has a button handler; Keep editing is the alert's dismiss.

## Leaving an unsaved draft (b-oss#1059)

Product decision: an unsaved draft (a new entry, or an edit with changes) is **not persisted**. Instead,
anything that would take the member away from it asks first ("Discard this entry?" / "Discard changes?",
Keep editing or Discard) and lets them cancel. "Unsaved" is `draft.dirty`.

**In the app: one guard, not one per screen.** `app/routes/DraftNavigationGuard.tsx` (mounted once inside
`IonReactRouter` in `AppShell`) wraps react-router's navigator and Ionic's `NavContext`, so every route change
goes through it: side menu and tabs, notification and deep-link taps, opening an entry or profile from a link,
the sign-in return, and the header Back/Home. Two things are not route changes and are covered separately:
Android's hardware Back (an `ionBackButton` handler at priority 2, above the router's own and the Browse
swallow, below Ionic's menu and overlays) and the account switcher (`useDraftLeaveGuard().confirmLeave`, since
a switch changes account without changing route). The rules are pure (`state/draftLeave.ts`):

- A move to the draft's **own screens** is not leaving (new entry: `/compose/details`, `/compose/location`,
  `/compose/description`; edit: `/entry/:id/edit`, its `/photo`, and the same two). So the picker and
  replace-photo round trips never ask. Anything else, including `/compose` itself, asks.
- Back (history -1, hardware Back) only leaves from the draft's **form** screen; from its photo or location
  screen Back returns to the form.
- Keep editing drops the move; Discard clears the draft (revoking its blob URLs) and then carries it out.
- The screens' own guarded Back/Home still ask first and clear the draft before they navigate, so the guard
  sees a clean store and passes them straight through.

**Page going away (desktop shell and plain browser).** The router never sees a reload or a quit, so the page
installs a `beforeunload` listener **only while the draft is dirty** (`platform/unloadGuard.ts`). A browser
shows its own generic question. The desktop shell (`b-mobile-pc/src/main/unload-guard.ts`):

| What the member does                               | Result                                                                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reload (Ctrl+R, F5, View menu)                     | Electron's `will-prevent-unload` → native "Discard your unsaved changes?" Keep editing cancels the reload.                                                               |
| Window close button, notifications **off**         | The window really closes, so the same question as a reload.                                                                                                              |
| Window close button, notifications **on**          | **No question**: it only hides to the tray; the page, and its draft, stay alive.                                                                                         |
| Quit: tray Exit, the app menu's quit, an installer | Asked in `before-quit`, from the flag the page reports over the bridge (`unsaved.set`), **before** the quit sequence disposes the tray and poller. Keep editing cancels. |
| Windows logoff or shutdown                         | Never asked (it must not be held up); the draft is lost.                                                                                                                 |

The quit needs the bridge flag because cancelling after the quit sequence has started would leave a live app
with no tray or poller; a hidden window cannot be asked, and the flag is reset whenever the page loads. The
tray's Exit with notifications on keeps its own "Exit b-mobile?" question, so a member with an unsaved draft
sees both. An older shell without `unsaved` is tolerated (the page checks for it).

**Not preventable, so not attempted:** the OS killing the app (Android swipe-away from recents, the low-memory
killer, a crash, power loss, End Task, a Windows shutdown). Android also has no hook for an app being
backgrounded and then reclaimed. A draft lost this way is simply gone; this is the "not persisted" decision.
Browser Back/Forward (popstate) in a plain browser build is not intercepted either, only unloading the page.

## What a round trip does to each field (tested)

The matrix runs the real screens through: location picker (Done / Back), replace-photo screen (Back /
pick again), leave-and-Keep-editing, a plain remount, a website sign-in (new entry gate; edit "Sign in to
see extras"), and a refresh (draft lost: edit re-seeds from the server, new entry returns to SCR-09), on
new entry and edit, with every `ComposeDraft` field set first. Not covered: SCR-11 is the biography
editor now and holds no compose state; the crop gesture (react-easy-crop) is set through the store.

## Known gaps (follow-up)

- A refresh loses an unsaved draft **by decision** (not persisted; see above): it now asks first.
- Removing or signing out of the account that owns the dirty draft does not ask (only switching does).
