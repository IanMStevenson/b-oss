// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps the local BlipfotoLinksPlugin (android/app/.../BlipfotoLinksPlugin.java — not an npm
// package, single-project only) — the runtime mechanism behind devicePrefsStore's
// openBlipfotoLinksInApp toggle (SCR-29, app-architecture.md §16). Toggles the disabled-by-default
// <activity-alias> that carries the opt-in https://www.blipfoto.com intent filter via
// PackageManager.setComponentEnabledSetting(). Web/iOS have no such mechanism (no android/
// project) — every export is a no-op off native, same stance every other platform/*.ts module
// takes.

import { Capacitor, registerPlugin } from '@capacitor/core';

interface BlipfotoLinksPlugin {
  setEnabled(options: { enabled: boolean }): Promise<void>;
}

const BlipfotoLinks = registerPlugin<BlipfotoLinksPlugin>('BlipfotoLinks');

export async function setBlipfotoLinksEnabled(enabled: boolean): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await BlipfotoLinks.setEnabled({ enabled });
}
