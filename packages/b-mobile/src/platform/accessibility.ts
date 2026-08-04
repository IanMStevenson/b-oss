// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Reads the OS accessibility font-scale setting (Settings > Display > Font size) via the local
// AccessibilityPlugin (android/app/.../AccessibilityPlugin.java) and applies it as a root
// font-size multiplier. app-architecture.md §20 flags this as a real risk, not a theoretical
// one: the WebView does not automatically apply Android's font-scale to CSS, and
// `window.devicePixelRatio` is not a substitute (it reflects display density, not the user's
// text-size preference) — the OS setting has to be read explicitly. Every rem-based size in this
// app's layouts (tokens.css, b-visual) scales off the root <html> font-size, so setting that once
// at launch is enough for the whole app to reflow at a 200% scale rather than clip.
//
// Desktop/web browsers already honour the OS/browser text-size preference on their own via the
// user-agent stylesheet, so applying a second multiplier there would double-scale — a no-op off
// native, same stance every other platform/*.ts module takes.

import { Capacitor, registerPlugin } from '@capacitor/core';

interface AccessibilityPlugin {
  getFontScale(): Promise<{ fontScale: number }>;
}

const Accessibility = registerPlugin<AccessibilityPlugin>('Accessibility');

const BASE_ROOT_FONT_SIZE_PX = 16;

export async function applyFontScale(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { fontScale } = await Accessibility.getFontScale();
  document.documentElement.style.fontSize = `${BASE_ROOT_FONT_SIZE_PX * fontScale}px`;
}
