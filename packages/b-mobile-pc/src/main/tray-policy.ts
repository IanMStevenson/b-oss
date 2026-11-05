// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The decisions behind "notifications on means tray-resident" (b-oss#610), kept pure so they are
// unit-tested: the tray, login item and dialog themselves cannot be exercised in a headless
// container. "Notifications on" means at least one account is being watched.

/** The window's close button hides the window while notifications are on. It never intercepts a
 * quit that is already under way (the tray's Exit, `app.quit()`, an updater, the OS ending the
 * session), so only the user's own close is turned into a hide. */
export function shouldHideOnClose(notificationsOn: boolean, isQuitting: boolean): boolean {
  return notificationsOn && !isQuitting;
}

/** The app starts with the user's login exactly while notifications are on. */
export function loginItemWanted(watchedAccounts: number): boolean {
  return watchedAccounts > 0;
}

export const EXIT_DIALOG = {
  type: 'question',
  buttons: ['Exit', 'Cancel'],
  defaultId: 1,
  cancelId: 1,
  title: 'Exit b-mobile',
  message: 'Exit b-mobile?',
  detail: 'Notifications will stop until you start b-mobile again.',
} as const;

/** The tray's Exit. With notifications off it quits at once; with them on it asks first, and only
 * the Exit button (index 0) quits. Exiting does not change the notifications setting. */
export async function requestExit(
  notificationsOn: boolean,
  ask: (options: typeof EXIT_DIALOG) => Promise<{ response: number }>,
  quit: () => void,
): Promise<boolean> {
  if (notificationsOn) {
    const { response } = await ask(EXIT_DIALOG);
    if (response !== 0) return false;
  }
  quit();
  return true;
}
