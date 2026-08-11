// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A single promise AppShell resolves once the active account is whatever it's going to be for
// this launch — accountsStore's own persisted-account hydration, plus, in dev/browser-testing
// mode, the VITE_DEV_TOKEN auto-seed finishing (AppShell.tsx). data/client.ts's getClient()
// awaits this before reading accountsStore, so a screen whose fetch fires very early in the mount
// cycle can't race ahead of knowing which account (if any) is active and silently fall back to
// an anonymous request — which a "User auth only" endpoint then correctly, but confusingly,
// rejects as if the real token were missing entirely. A tiny standalone module rather than living
// in accountsStore.ts or accountsFlow.ts: accountsFlow.ts already imports from data/client.ts
// (devSignInWithToken calls getClientForToken), so client.ts importing devSignInWithToken back
// from accountsFlow.ts for this would be circular.

let resolveReady: () => void;

export const authReady: Promise<void> = new Promise((resolve) => {
  resolveReady = resolve;
});

/** Idempotent — resolving an already-resolved promise is a no-op, so callers don't need to track
 * whether this has already fired. */
export function markAuthReady(): void {
  resolveReady();
}
