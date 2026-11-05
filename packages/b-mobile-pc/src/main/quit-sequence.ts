// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// What happens when the app quits (b-oss#710): on Windows the tray's Exit removed the icon but the
// process stayed in Task Manager. Quitting now disposes everything the app started itself (the
// poller's timer, the tray, any toast still held) and, as a backstop, forces the process to end if
// Electron has not done so after a grace period. Kept pure (Electron and timers injected) so it is
// unit-tested; the real Windows behaviour is not testable on the dev VM.

/** How long Electron gets to finish quitting on its own before the process is ended by force. */
export const QUIT_GRACE_MS = 3_000;

export interface QuitDeps {
  /** Each step is independent: one throwing must not stop the others. */
  disposers: ReadonlyArray<() => void>;
  forceExit: () => void;
  log: (message: string) => void;
  setTimer: (fn: () => void, ms: number) => { unref?: () => void };
  graceMs?: number;
}

/** Returns a function to call on `before-quit`; calling it more than once does nothing more. */
export function createQuitSequence(deps: QuitDeps): () => void {
  let started = false;
  return () => {
    if (started) return;
    started = true;
    deps.log('quit: disposing poller, tray and notifications');
    for (const dispose of deps.disposers) {
      try {
        dispose();
      } catch (err) {
        deps.log(`quit: a dispose step failed: ${err instanceof Error ? err.message : 'error'}`);
      }
    }
    const timer = deps.setTimer(() => {
      deps.log('quit: process still alive after the grace period, forcing exit');
      deps.forceExit();
    }, deps.graceMs ?? QUIT_GRACE_MS);
    // Never itself keeps the process alive; only a hung quit reaches it.
    timer.unref?.();
  };
}
