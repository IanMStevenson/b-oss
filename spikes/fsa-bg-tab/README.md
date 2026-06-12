# Spike #1 — FSA persistence + unfocused background-tab write (extension origin)

**The question (linchpin of the b-ark-chrome design):** after a one-time
**"Allow on every visit"** re-grant, does the folder permission persist across browser
restarts on the **extension origin**, so an **unfocused background tab** can write silently?

Key correction from the first run: the persistent "Allow on every visit" prompt only
appears when `requestPermission()` is called on a **stored handle on a _later_ visit** —
not on the first pick, and never via `queryPermission()`. So the experiment must do the
re-grant on a second visit, then check persistence on a third.

## Staged protocol (fully quit & reopen Chrome between stages)

1. `chrome://extensions` → Developer mode → **Load unpacked** → `spikes/fsa-bg-tab`.
   Open the extension's **Options** page (it also opens on install).
2. **Stage 0:** click **Pick & store**, choose a throwaway folder. (No re-request yet.)
3. **Quit & reopen Chrome.** Reopen Options. The top readout should say `prompt`.
   Click **Re-grant** → Chrome should offer **"Allow on every visit"** → choose it.
4. **Quit & reopen Chrome.** Reopen Options. **Read the top line with no click:**
   - `granted` → **persistence confirmed.** Now click the extension's **toolbar icon**
     → the unfocused background writer should report `SUCCESS`.
   - `prompt` → permission did **not** persist across restart on the extension origin.

## What to report back

- Stage 1: did Chrome offer **"Allow on every visit"**? (yes/no) and the logged `before/after`.
- Stage 2: the **on-load readout** (`granted` or `prompt`, with no click), and the background
  writer result.

## Outcomes → design impact

| Stage 2 on-load readout      | Meaning                                                        | Design                                                                                                |
| ---------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `granted` + writer `SUCCESS` | Grant persists; background tab writes silently across restarts | **Option C is fully automatic** — no per-session click                                                |
| `prompt` (writer blocked)    | Re-grant works but doesn't persist past restart                | Option C stands, but **first backup each session needs one focused re-grant click** (amber "Back up") |

## Files

- `manifest.json` — MV3, `storage` only, SW + options page.
- `setup.html` / `setup.js` — staged test UI; **auto-reports `queryPermission` on load**.
- `sw.js` — opens `writer.html` as an unfocused background tab on toolbar-icon click.
- `writer.js` / `writer.html` — the background writer (queryPermission → write).
- `idb.js` — raw-IndexedDB handle store (mirrors the VHA pattern).
- `web-origin-cs.js` — unused; an optional web-origin counterpart kept only as a fallback
  test (origin turned out not to be the variable).
