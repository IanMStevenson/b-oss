// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Asking before the page or the app goes while the member has an unsaved draft (b-oss#1059).
//
// How it works: the web app listens for `beforeunload` while a draft has unsaved changes
// (b-mobile `platform/unloadGuard.ts`). Electron turns an objecting page into a `will-prevent-unload`
// event on the window's webContents, for every way the page can go: a reload (Ctrl+R, F5, the View
// menu), the window closing, and `app.quit()` (the tray's Exit, the app menu's quit, an installer),
// which closes the windows first. Showing this dialog and calling `preventDefault()` there ignores
// the page's objection (Discard); doing nothing keeps the page, and so cancels the reload or quit.
// The page is asked, so the shell needs no copy of "is the draft dirty" and a hidden window (the
// tray) answers the same as a shown one.
//
// A quit is decided earlier, in `before-quit`, from the flag the page reports over the bridge
// (`decideQuit`): by the time windows close the quit sequence has already run, so cancelling there
// would leave the app half torn down.
//
// Not asked: the close button while notifications are on, because that only hides the window to the
// tray (the page stays alive with its draft); a Windows logoff or shutdown, which must not be held
// up; and anything that kills the process (a crash, End Task).

export const UNSAVED_DIALOG = {
  type: 'question',
  buttons: ['Discard', 'Keep editing'],
  defaultId: 1,
  cancelId: 1,
  title: 'Unsaved entry',
  message: 'Discard your unsaved changes?',
  detail: 'Your entry has not been saved or published. If you continue, it is lost.',
} as const;

/** True when the unload should go ahead (the page's objection is overridden): the OS is ending the
 * session, or the member pressed Discard (button 0). `ask` returns the pressed button's index; it
 * is not called during a session end. */
export function shouldDiscardOnUnload(sessionEnding: boolean, ask: () => number): boolean {
  if (sessionEnding) return true;
  return ask() === 0;
}

/** A quit (tray Exit, the menu, an installer): `dirty` is the page's last report over the bridge.
 * 'quit' when nothing unsaved would be lost, the member already pressed Discard, or the OS is
 * ending the session; otherwise asks, and 'cancel' unless Discard is pressed. */
export function decideQuit(
  state: { dirty: boolean; sessionEnding: boolean; discardConfirmed: boolean },
  ask: () => number,
): 'quit' | 'cancel' {
  if (!state.dirty || state.discardConfirmed) return 'quit';
  return shouldDiscardOnUnload(state.sessionEnding, ask) ? 'quit' : 'cancel';
}

/** Test hook (unpackaged shell only, see notify-test-presenter.ts): stands in for the native
 * dialog, which a container cannot click. Answers Keep editing until told otherwise. */
export class RecordedUnloadDialog {
  asked = 0;
  answer = 1;
  ask(): number {
    this.asked += 1;
    return this.answer;
  }
}
