// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The shell's own build identifier (b-oss#696). It is the same string b-mobile's web build shows as
// its `__APP_VERSION__` (package version plus the build stamp, e.g. 1.0.2.0.22), computed by
// electron.vite.config.ts from the same version.generated.json, so a shell and a web build made
// together carry equal strings. The web app compares the two at start-up.

/** What the shell reports. `override` is an e2e hook and only counts in a non-packaged run. */
export function resolveShellBuild(opts: {
  stamped: string | undefined;
  override: string | undefined;
  allowOverride: boolean;
}): string {
  if (opts.allowOverride && opts.override) return opts.override;
  return opts.stamped && opts.stamped !== '' ? opts.stamped : 'unknown';
}
