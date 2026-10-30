// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The contract between the main process and the web app. The preload exposes this as
// `window.bMobileDesktop`; b-mobile's platform layer (src/platform/desktop.ts) holds a matching
// copy of the types, because b-mobile must not depend on this package. Keep the two in step; the
// e2e tests exercise the real round trip.

export const BRIDGE_GLOBAL = 'bMobileDesktop';

export const CHANNELS = {
  secureGet: 'secure:get',
  secureSet: 'secure:set',
  secureRemove: 'secure:remove',
  authOpen: 'auth:open',
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
}
