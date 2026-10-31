// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The contract between the main process and the web app. The preload exposes this as
// `window.bMobileDesktop`; b-mobile's platform layer (src/platform/desktop.ts) holds a matching
// copy of the types, because b-mobile must not depend on this package. Keep the two in step; the
// e2e tests exercise the real round trip.

import type { NotifyPayload, NotifySettings, NotifyStatus, TestNotifyResult } from './notify.js';

export const BRIDGE_GLOBAL = 'bMobileDesktop';

export const CHANNELS = {
  secureGet: 'secure:get',
  secureSet: 'secure:set',
  secureRemove: 'secure:remove',
  authOpen: 'auth:open',
  notifyConfigure: 'notify:configure',
  notifyReceived: 'notify:received',
  notifyTapped: 'notify:tapped',
  notifyTappedReady: 'notify:tapped-ready',
  diagLog: 'diag:log',
  diagOpenLogFolder: 'diag:open-log-folder',
  diagCopy: 'diag:copy',
  notifyStatus: 'notify:status',
  notifyCheckNow: 'notify:check-now',
  notifyTest: 'notify:test',
} as const;

export interface DesktopBridge {
  readonly version: 1;
  readonly secure: {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    remove(key: string): Promise<void>;
  };
  /** Opens the sign-in page in a clean, throwaway window and resolves with the redirect URL it
   * captured once navigation reaches `redirectPrefix`. Rejects with Error('cancelled') if closed. */
  openAuth(url: string, redirectPrefix: string): Promise<string>;
  /** Desktop notifications by polling (b-oss#610). The main process polls for the accounts the app
   * names here, with the account's app token from the secure store, and keeps doing so with the
   * window closed (it hides to the tray). Call it with the full set whenever it changes and at
   * start-up; accounts with every stream off are simply left out. */
  readonly notify: {
    configure(settings: NotifySettings): Promise<void>;
    /** Per-account status of the polling (b-oss#673). Read-only. */
    status(): Promise<NotifyStatus>;
    /** Checks every watched account now (rate-limit aware) and returns the new status. */
    checkNow(): Promise<NotifyStatus>;
    /** Shows a toast immediately, without the API, and reports what the OS said. */
    sendTest(): Promise<TestNotifyResult>;
    /** A notification was shown (the window may be focused or hidden): refresh unread counts. */
    onReceived(handler: (payload: NotifyPayload) => void): () => void;
    /** The user clicked a notification; the window has already been brought to the front. A click
     * that happened before anyone listened is delivered to the first listener. */
    onTapped(handler: (payload: NotifyPayload) => void): () => void;
  };
  /** The error log and the error screen's actions (b-oss#639). */
  readonly diagnostics: {
    /** Appends one redacted entry to `userData/logs/app.log`. Never rejects. */
    logError(entry: { source: string; message: string; stack?: string }): Promise<void>;
    openLogFolder(): Promise<void>;
    /** Puts text on the system clipboard (the page has no clipboard permission of its own). */
    copyText(text: string): Promise<void>;
  };
}
