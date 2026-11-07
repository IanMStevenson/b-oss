// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The shell's preload exposes this on the page; the tests read it inside page.evaluate().
import type { DesktopBridge } from '../src/shared/bridge.js';

declare global {
  interface Window {
    bMobileDesktop?: DesktopBridge;
  }
}
