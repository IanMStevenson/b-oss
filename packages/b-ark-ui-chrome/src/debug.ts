// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Diagnostic logging that compiles to no-ops in release builds.
// `__RELEASE__` is injected by the b-ark-chrome vite config (true only for RELEASE=1 builds)
// and defaults to false in dev, so these logs are visible while developing but never ship to
// end users' consoles. Genuine errors should use console.error directly, not this helper.

export const debug = {
  log(...args: unknown[]): void {
    if (!__RELEASE__) console.log(...args);
  },
  warn(...args: unknown[]): void {
    if (!__RELEASE__) console.warn(...args);
  },
};
