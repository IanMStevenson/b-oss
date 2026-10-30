// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The desktop shell (packages/b-mobile-pc, an Electron main process) exposes `window.bMobileDesktop`
// from its preload; its presence is how the app knows it is hosted on desktop rather than by
// Capacitor or in a plain browser. This is a copy of the contract in
// packages/b-mobile-pc/src/shared/bridge.ts: b-mobile must not depend on that package, so keep the
// two in step (the shell's e2e tests exercise the real round trip). Only platform/** reads it.

/** Same shape as b-mobile's PushPayload (platform/push.ts), so tap routing is shared. */
export type DesktopNotifyPayload =
  | { kind: 'activity'; stream: 'comments' | 'notifications'; accountId: string }
  | { kind: 'reauth-required'; accountId: string };

export interface DesktopNotifySettings {
  accounts: { accountId: string; streams: { comments: boolean; notifications: boolean } }[];
}

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
  readonly notify: {
    configure(settings: DesktopNotifySettings): Promise<void>;
    onReceived(handler: (payload: DesktopNotifyPayload) => void): () => void;
    onTapped(handler: (payload: DesktopNotifyPayload) => void): () => void;
    getLaunchAtLogin(): Promise<{ supported: boolean; enabled: boolean }>;
    setLaunchAtLogin(enabled: boolean): Promise<void>;
  };
}

const BRIDGE_GLOBAL = 'bMobileDesktop';

/** The desktop shell's bridge, or undefined anywhere else (Android, iOS, a browser, a test). */
export function desktopBridge(): DesktopBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  const bridge = (window as unknown as Record<string, unknown>)[BRIDGE_GLOBAL];
  if (typeof bridge !== 'object' || bridge === null) return undefined;
  return (bridge as { version?: unknown }).version === 1 ? (bridge as DesktopBridge) : undefined;
}
