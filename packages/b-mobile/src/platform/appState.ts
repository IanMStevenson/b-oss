// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/app, network, and device: foreground/background transitions, connectivity,
// device facts. Used for things like re-checking OS notification permission on resume (rules.md)
// and resetting stale upload-queue items on launch (§9).
// TODO(Phase 2+): implement against @capacitor/app, @capacitor/network, @capacitor/device.

import { Capacitor } from '@capacitor/core';

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function onAppStateChange(_handler: (isActive: boolean) => void): () => void {
  return () => {};
}
