// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Desktop notifications by polling (b-oss#610): the desktop shell's main process polls for unread
// counts and shows the OS notification; this module is the app's only way to talk to it. Off the
// desktop shell every export is a no-op, the same stance as platform/push.ts off native.

import { desktopBridge } from './desktop.js';
import type {
  DesktopNotifyPayload,
  DesktopNotifySettings,
  DesktopNotifyStatus,
  DesktopTestNotifyResult,
} from './desktop.js';

export type {
  DesktopAccountStatus,
  DesktopNotifyPayload,
  DesktopNotifySettings,
  DesktopNotifyStatus,
  DesktopTestNotifyResult,
} from './desktop.js';

/** Tells the shell which accounts to watch (the full set, every time). */
export async function configureDesktopNotifications(
  settings: DesktopNotifySettings,
): Promise<void> {
  await desktopBridge()?.notify.configure(settings);
}

/** A notification was shown: refresh the unread counts. */
export function onDesktopNotificationReceived(
  handler: (payload: DesktopNotifyPayload) => void,
): () => void {
  return desktopBridge()?.notify.onReceived(handler) ?? (() => {});
}

/** The user clicked a notification (the shell has already raised the window). */
export function onDesktopNotificationTapped(
  handler: (payload: DesktopNotifyPayload) => void,
): () => void {
  return desktopBridge()?.notify.onTapped(handler) ?? (() => {});
}

/** Per-account polling status for the settings screen; null off the desktop shell. */
export async function getDesktopNotifyStatus(): Promise<DesktopNotifyStatus | null> {
  return (await desktopBridge()?.notify.status()) ?? null;
}

/** Asks the shell to check every watched account now; null off the desktop shell. */
export async function checkDesktopNotificationsNow(): Promise<DesktopNotifyStatus | null> {
  return (await desktopBridge()?.notify.checkNow()) ?? null;
}

/** Shows a toast at once, without the API ("Send a test notification"). */
export async function sendDesktopTestNotification(): Promise<DesktopTestNotifyResult | null> {
  return (await desktopBridge()?.notify.sendTest()) ?? null;
}
