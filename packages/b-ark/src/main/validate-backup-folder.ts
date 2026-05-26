// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import path from 'node:path';
import { promises as fs } from 'node:fs';

export interface BackupFolderValidationOptions {
  /**
   * Absolute directory paths that the backup folder must not be equal to,
   * nor a descendant of. Typically: the OS system root, the running
   * executable's directory, the app's userData and resources roots, etc.
   */
  blockedRoots: string[];
}

/**
 * Validate a renderer-supplied backup-folder path before binding it as the
 * destination for all backup writes.
 *
 * Why this matters: `moveBackupFolder` (and `chooseBackupFolder`) take a
 * raw string from the renderer and use it as the root for subsequent file
 * writes. The legitimate UI flow goes through `dialog.showOpenDialog`, but
 * the IPC surface itself must not trust the caller — a future renderer-side
 * compromise (XSS, malicious extension on Electron, etc.) could otherwise
 * redirect backups into a sensitive directory.
 *
 * On success returns the normalised absolute path. On failure throws an
 * `Error` with a message suitable for surfacing to the user.
 */
export async function validateBackupFolderPath(
  raw: unknown,
  opts: BackupFolderValidationOptions,
): Promise<string> {
  if (typeof raw !== 'string') {
    throw new Error('Backup folder path must be a string.');
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error('Backup folder path is empty.');
  }
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      throw new Error('Backup folder path contains control characters.');
    }
  }
  if (!path.isAbsolute(trimmed)) {
    throw new Error(`Backup folder path must be absolute: ${trimmed}`);
  }
  const normalised = path.normalize(trimmed);

  for (const root of opts.blockedRoots) {
    if (!root) continue;
    const normalisedRoot = path.normalize(root);
    const rel = path.relative(normalisedRoot, normalised);
    const isInside = rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
    if (isInside) {
      throw new Error(`Backup folder must not be inside a protected location (${normalisedRoot}).`);
    }
  }

  let stat: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    stat = await fs.lstat(normalised);
  } catch {
    throw new Error(`Backup folder does not exist: ${normalised}`);
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`Backup folder must not be a symbolic link or reparse point: ${normalised}`);
  }
  if (!stat.isDirectory()) {
    throw new Error(`Backup folder is not a directory: ${normalised}`);
  }

  const probe = path.join(normalised, '.b-ark-write-probe');
  try {
    await fs.writeFile(probe, '');
  } catch {
    throw new Error(`Backup folder is not writable: ${normalised}`);
  }
  try {
    await fs.unlink(probe);
  } catch {
    // probe was written but couldn't be removed — treat as non-fatal.
  }

  return normalised;
}
