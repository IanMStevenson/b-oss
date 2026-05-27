// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Ambient declarations available to every package in the monorepo.

declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}

declare module '*.css' {
  const _: undefined;
  export default _;
}

// Build-time injected by vite/electron-vite `define` — see scripts/version.mjs.
declare const __APP_VERSION__: string;
