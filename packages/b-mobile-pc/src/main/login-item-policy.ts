// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Start-at-login hygiene (b-oss#696). The login item points at whichever exe was running when
// notifications were switched on. If that is a build in a dev folder (a synced win-unpacked, a
// checkout), the item keeps launching an old copy from the folder that every new build replaces, which
// holds its files open. So a login item is not registered from a folder that looks like a dev folder.
// Pure: file system access is injected, so this runs the same in tests on any OS.

const DEV_ENTRIES = ['node_modules', '.git'] as const;
/** Folder names that only a build output or a dependency tree has in its path. */
const DEV_SEGMENTS = new Set(['node_modules', 'dist-electron']);
/** How many folders above the exe are looked at; a build is a few levels below its repo root. */
const MAX_LEVELS = 6;

/** Splits on both separators; keeps the original separator style when rebuilding a parent. */
function parentOf(path: string): string | null {
  if (/^[A-Za-z]:[\\/]?$/.test(path)) return null; // a drive root has no parent
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (cut <= 0) return null;
  const parent = path.slice(0, cut);
  // "C:" is the drive, not a folder to look in.
  return /^[A-Za-z]:$/.test(parent) ? `${parent}${path[cut]}` : parent;
}

/**
 * True if the exe at `exePath` is inside something that looks like a dev folder: a `node_modules` or
 * `dist-electron` path segment, or a `node_modules` / `.git` entry in any of the next few folders up.
 * `hasEntry(dir, name)` says whether `dir` contains an entry called `name`.
 */
export function isDevFolder(
  exePath: string,
  hasEntry: (dir: string, name: string) => boolean,
): boolean {
  const segments = exePath.split(/[\\/]+/).slice(0, -1);
  if (segments.some((s) => DEV_SEGMENTS.has(s.toLowerCase()))) return true;
  let dir = parentOf(exePath);
  for (let level = 0; dir !== null && level < MAX_LEVELS; level++) {
    for (const name of DEV_ENTRIES) {
      if (hasEntry(dir, name)) return true;
    }
    dir = parentOf(dir);
  }
  return false;
}

export type LoginItemDecision =
  { action: 'set'; openAtLogin: boolean } | { action: 'leave-alone'; reason: string };

/**
 * What to do with the login item. Switching it off is always allowed (the user turned notifications
 * off, and that must clear a stale item). Switching it on is skipped from a dev folder. Leaving it
 * untouched rather than "off" matters: the item's registry name is the same for every copy of the
 * app, so writing "off" from a dev copy would also remove an installed copy's item.
 */
export function decideLoginItem(opts: {
  wanted: boolean;
  packaged: boolean;
  devFolder: boolean;
}): LoginItemDecision {
  if (!opts.packaged) {
    return { action: 'leave-alone', reason: 'not a packaged app' };
  }
  if (opts.wanted && opts.devFolder) {
    return {
      action: 'leave-alone',
      reason:
        'this exe is in a dev folder (node_modules, .git or dist-electron); use an installed copy',
    };
  }
  return { action: 'set', openAtLogin: opts.wanted };
}
