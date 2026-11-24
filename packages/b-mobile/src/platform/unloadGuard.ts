// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The page going away with an unsaved draft (b-oss#1059): a browser tab closing or reloading, and in
// the desktop shell a reload (Ctrl+R, F5, the View menu) or a quit that closes the window. The
// router never sees these, so the page itself objects with `beforeunload`, and only while there is
// something to lose (a standing listener would keep the page out of the back/forward cache). A
// browser shows its own generic question; the desktop shell turns Electron's `will-prevent-unload`
// into the app's own native Discard / Keep editing dialog (b-mobile-pc `unload-guard.ts`).
// Not preventable, and not attempted: the OS ending the app (Android swipe-away, a crash, power loss).

import { useComposeDraftStore } from '../state/composeDraftStore.js';

export function installUnloadGuard(target: Window = window): () => void {
  const onBeforeUnload = (event: BeforeUnloadEvent): void => {
    event.preventDefault();
    // Legacy browsers only show their prompt when returnValue is set.
    event.returnValue = '';
  };
  let listening = false;
  const sync = (dirty: boolean): void => {
    if (dirty && !listening) target.addEventListener('beforeunload', onBeforeUnload);
    else if (!dirty && listening) target.removeEventListener('beforeunload', onBeforeUnload);
    listening = dirty;
  };
  sync(useComposeDraftStore.getState().draft?.dirty === true);
  const unsubscribe = useComposeDraftStore.subscribe((state) => sync(state.draft?.dirty === true));
  return () => {
    unsubscribe();
    sync(false);
  };
}
