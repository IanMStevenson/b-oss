// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Shell/web build mismatch (b-oss#696). On desktop the shell (Electron main process) and this web
// build are separate files that a synced build or an update can replace independently. When the shell
// that is running is older than the web files it serves, the web app calls main-process features the
// old shell lacks. The shell reports its own build id through the bridge (stamped from the same
// version.generated.json as `__APP_VERSION__`); this module compares the two. Desktop only: with no
// bridge (Android, iOS, a browser) nothing here does anything.

import { desktopBridge } from './desktop.js';

export type ShellBuildCheck =
  { kind: 'match'; shell: string; web: string } | { kind: 'mismatch'; shell: string; web: string };

/** What a shell with no `shell` member (one older than this check) is reported as. */
export const OLDER_SHELL = 'unknown (older shell)';

/** Equal ids match. A shell that reported nothing is a mismatch by definition. */
export function compareBuilds(shell: string | undefined, web: string): ShellBuildCheck {
  const reported = shell && shell !== '' ? shell : OLDER_SHELL;
  return { kind: reported === web ? 'match' : 'mismatch', shell: reported, web };
}

export function webBuild(): string {
  return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown';
}

let known: ShellBuildCheck | null = null;

/** The last check's result, for "Copy details" and About (null before it ran, or off desktop). */
export function knownShellBuild(): ShellBuildCheck | null {
  return known;
}

/** Test seam. */
export function resetShellBuildForTests(): void {
  known = null;
}

/** Asks the shell for its build and compares. Null off desktop; never throws. */
export async function checkShellBuild(): Promise<ShellBuildCheck | null> {
  const bridge = desktopBridge();
  if (!bridge) return null;
  let reported: string | undefined;
  try {
    reported = (await bridge.shell?.info())?.build;
  } catch {
    reported = undefined;
  }
  known = compareBuilds(reported, webBuild());
  return known;
}

/** The one-line log text for a mismatch. */
export function mismatchLogLine(check: ShellBuildCheck): string {
  return `shell build ${check.shell} does not match web build ${check.web}: the app is running a different shell than its web files`;
}
