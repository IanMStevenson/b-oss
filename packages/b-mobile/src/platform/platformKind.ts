// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The one place that knows which platform the app is hosted on. Everything else asks this module
// (directly, or through platform/capabilities.ts) rather than calling Capacitor.isNativePlatform()
// itself; an ESLint rule keeps it that way (b-oss#608, epic b-oss#605).

import { Capacitor } from '@capacitor/core';
import { desktopBridge } from './desktop.js';

export type PlatformKind = 'android' | 'ios' | 'desktop' | 'web';

/** True when a Capacitor native shell (Android today, iOS later) hosts the app, i.e. when the
 * Capacitor plugins have real native implementations. Identical to Capacitor.isNativePlatform():
 * the desktop shell is deliberately not Capacitor, so this is false there and the plugins' web
 * fallbacks apply. */
export function isCapacitorNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** Which platform hosts the app. The desktop shell is recognised by its preload bridge; a Capacitor
 * native shell is Android unless it says iOS (there is no iOS project yet); anything else is `web`. */
export function platformKind(): PlatformKind {
  if (desktopBridge() !== undefined) return 'desktop';
  if (!Capacitor.isNativePlatform()) return 'web';
  return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
}
