# SCR-09 — New Entry (pick photo)   [Must]

**Purpose:** Start a new entry by choosing its photo — take one now or pick from the device.

**Reached from:** "New Entry" in primary navigation; the new-entry quick action. (Share-to-Blipfoto
skips this screen and lands on `SCR-10` with the shared photo.)
**Leads to:** `SCR-10 Compose Entry Details` (with the chosen photo). Account-gated — see `FLW-01`.

## Layout (ASCII wireframe)
```
+--------------------------------------+
| <  New entry                         |
|                                      |
|   +------------------------------+   |
|   |        Take a photo          |   |  opens camera
|   +------------------------------+   |
|                                      |
|   +------------------------------+   |
|   |     Choose from device       |   |  opens photo picker
|   +------------------------------+   |
|                                      |
+--------------------------------------+
```

## Components & data shown
- **Take a photo** — opens the camera; the captured image becomes the entry photo.
- **Choose from device** — opens the system photo picker.

## States
- **Idle** — the two choices.
- **Account required, and read-write** — if the user is not signed in, route through sign-in
  first (`FLW-01`), which always signs in read-write; on success, return here. A **read-only**
  account never reaches this screen — the upgrade prompt (`rules.md`, `FLW-12`) is shown instead,
  before navigating here.
- **Camera permission needed** — "Take a photo" requires the camera permission. Request it at the
  point the user taps that action, not on screen entry. If **refused**, stay on this screen and
  explain that taking a photo needs camera access, leaving "Choose from device" fully usable — a
  refusal must never block the whole compose flow, since picking an existing photo needs no camera.
  If refused in a way the OS will no longer re-prompt for, offer a route to system settings rather
  than re-requesting into silence.
- **Capture/pick cancelled** — return to Idle.
- **Unusable photo** — if the chosen file is an unsupported type or too small, show a clear message
  and stay (validation detail is enforced on `SCR-10`).

## Actions & rules
- **Take a photo** → request camera permission if not held → camera → on success continue to
  `SCR-10` with the photo.
- **Choose from device** → photo picker → on success continue to `SCR-10`. **No permission is
  requested for this path** — the system picker grants access to the chosen item only.
- Use the platform photo-picker / scoped-storage approach (no broad storage permissions).
- No Blipfoto API calls here.

## API touchpoints
None directly (system camera/picker). Publishing happens later via `SCR-10` / `FLW-12`.

## Acceptance criteria
- [ ] Given a signed-in user, both capture and pick lead to `SCR-10` with the chosen photo.
- [ ] Given an anonymous user, sign-in is required before composing (`FLW-01`).
- [ ] Given a signed-in, read-only user, the upgrade prompt is shown instead of this screen
      opening.
- [ ] Given the user cancels capture/pick, they return to this screen without error.
- [ ] Given camera permission is refused, "Take a photo" explains why and "Choose from device"
      still works; the compose flow is never blocked outright.
- [ ] The flow uses the system photo picker without requesting broad storage permissions.
