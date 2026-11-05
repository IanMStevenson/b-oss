// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A click on a notification can arrive before the web app has attached its listener (a window that
// was hidden while the app was still loading, say). Hold such clicks and hand them over when a
// listener is ready, rather than dropping the user's tap.

import type { NotifyPayload } from '../shared/notify.js';

const MAX_PENDING = 8;

export class TapQueue {
  private pending: NotifyPayload[] = [];

  constructor(private listening = false) {}

  /** Sends now if a listener is attached, otherwise holds it (newest kept if it overflows). */
  tap(payload: NotifyPayload, send: (payload: NotifyPayload) => void): void {
    if (this.listening) {
      send(payload);
      return;
    }
    this.pending.push(payload);
    if (this.pending.length > MAX_PENDING) this.pending.shift();
  }

  /** The web app has a listener now: deliver anything held, in order. */
  ready(send: (payload: NotifyPayload) => void): void {
    this.listening = true;
    for (const payload of this.pending.splice(0)) send(payload);
  }

  /** The page went away (reload, navigation): clicks hold again until it asks. */
  reset(): void {
    this.listening = false;
  }
}
