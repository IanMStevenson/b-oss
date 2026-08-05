// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/app, network, and device: foreground/background transitions, connectivity,
// device facts. `onAppStateChange` is what AppShell.tsx uses to re-run pushFlow.ts's
// `runLaunchBackstopCheck()` on resume, not only at launch — rules.md is explicit that "returning
// from system settings is not assumed to have succeeded... re-check the permission when the app
// resumes and act on what it now says." Resetting stale upload-queue items (§9) stays a
// launch-only concern (flows/uploadQueueRunner.ts's own recovery sweep, called once from
// AppShell.tsx) — nothing here duplicates it.
// TODO(Phase 2+): implement against @capacitor/network, @capacitor/device.

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/** Fires on every foreground/background transition — `isActive` is `true` on resume, `false` on
 * backgrounding. Never fires for the initial launch state (only for later transitions), so a
 * caller that already runs its own launch-time check doesn't need to guard against a duplicate
 * first call. No-op off native, same stance every other platform/*.ts module takes. */
export function onAppStateChange(handler: (isActive: boolean) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  let handle: { remove: () => void } | undefined;
  void App.addListener('appStateChange', (state) => handler(state.isActive)).then((h) => {
    handle = h;
  });
  return () => handle?.remove();
}
