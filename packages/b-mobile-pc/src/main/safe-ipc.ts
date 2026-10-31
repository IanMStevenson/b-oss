// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Main <-> renderer calls that can race with the page going away. Electron throws "Render frame was
// disposed before WebFrameMain could be accessed" from `webContents.send` and from the IPC event's
// `senderFrame` when the frame is already gone (a reload, a close, a client disconnecting); left
// alone it surfaces as an unhandled rejection in the main process. Pure (structural types) so it is
// unit-tested without Electron.

import { isTrustedSender } from './app-protocol.js';

/** The parts of a `BrowserWindow` that `safeSend` touches. */
export interface SendableWindow {
  isDestroyed(): boolean;
  webContents: {
    isDestroyed(): boolean;
    send(channel: string, ...args: unknown[]): void;
  };
}

/** Sends to the window's page if it is still there. Returns whether it was sent; never throws. */
export function safeSend(
  win: SendableWindow | null | undefined,
  channel: string,
  ...args: unknown[]
): boolean {
  try {
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return false;
    win.webContents.send(channel, ...args);
    return true;
  } catch {
    // The frame was disposed between the check and the send: the page is gone, nothing to tell.
    return false;
  }
}

/** Whether an IPC event came from our own page. Reading `senderFrame` can throw once the frame is
 * gone; that counts as untrusted (the caller rejects cleanly), never as an error. */
export function isTrustedEvent(event: { senderFrame?: { url: string } | null }): boolean {
  try {
    return isTrustedSender(event.senderFrame?.url);
  } catch {
    return false;
  }
}
