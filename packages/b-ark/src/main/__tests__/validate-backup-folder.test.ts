// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { validateBackupFolderPath } from '../validate-backup-folder.js';

describe('validateBackupFolderPath', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'b-ark-validate-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('accepts a normal writable directory and returns the normalised path', async () => {
    const result = await validateBackupFolderPath(tmpDir, { blockedRoots: [] });
    expect(result).toBe(path.normalize(tmpDir));
  });

  it('rejects non-string input', async () => {
    await expect(validateBackupFolderPath(123, { blockedRoots: [] })).rejects.toThrow(
      /must be a string/,
    );
    await expect(validateBackupFolderPath(null, { blockedRoots: [] })).rejects.toThrow(
      /must be a string/,
    );
    await expect(validateBackupFolderPath(undefined, { blockedRoots: [] })).rejects.toThrow(
      /must be a string/,
    );
  });

  it('rejects an empty or whitespace-only path', async () => {
    await expect(validateBackupFolderPath('', { blockedRoots: [] })).rejects.toThrow(/empty/);
    await expect(validateBackupFolderPath('   ', { blockedRoots: [] })).rejects.toThrow(/empty/);
  });

  it('rejects a relative path', async () => {
    await expect(validateBackupFolderPath('relative/path', { blockedRoots: [] })).rejects.toThrow(
      /must be absolute/,
    );
  });

  it('rejects a path containing a NUL byte', async () => {
    const bad = tmpDir + String.fromCharCode(0) + 'extra';
    await expect(validateBackupFolderPath(bad, { blockedRoots: [] })).rejects.toThrow(
      /control characters/,
    );
  });

  it('rejects a path containing other control characters', async () => {
    const bad = tmpDir + String.fromCharCode(0x07) + 'extra';
    await expect(validateBackupFolderPath(bad, { blockedRoots: [] })).rejects.toThrow(
      /control characters/,
    );
  });

  it('rejects a path equal to a blocked root', async () => {
    await expect(validateBackupFolderPath(tmpDir, { blockedRoots: [tmpDir] })).rejects.toThrow(
      /protected location/,
    );
  });

  it('rejects a path inside a blocked root', async () => {
    const child = path.join(tmpDir, 'child');
    await fs.mkdir(child);
    await expect(validateBackupFolderPath(child, { blockedRoots: [tmpDir] })).rejects.toThrow(
      /protected location/,
    );
  });

  it('rejects a nonexistent path', async () => {
    const ghost = path.join(tmpDir, 'does-not-exist');
    await expect(validateBackupFolderPath(ghost, { blockedRoots: [] })).rejects.toThrow(
      /does not exist/,
    );
  });

  it('rejects a path that points at a file rather than a directory', async () => {
    const file = path.join(tmpDir, 'a-file.txt');
    await fs.writeFile(file, 'hello');
    await expect(validateBackupFolderPath(file, { blockedRoots: [] })).rejects.toThrow(
      /not a directory/,
    );
  });

  it('rejects a symlink to a directory', async () => {
    const target = path.join(tmpDir, 'real-dir');
    await fs.mkdir(target);
    const link = path.join(tmpDir, 'link');
    try {
      await fs.symlink(target, link, 'dir');
    } catch {
      // Skip on platforms / CI users that cannot create symlinks (e.g. Windows
      // without developer mode). The behaviour is still covered on Unix.
      return;
    }
    await expect(validateBackupFolderPath(link, { blockedRoots: [] })).rejects.toThrow(
      /symbolic link/,
    );
  });

  it('ignores empty strings in blockedRoots', async () => {
    const result = await validateBackupFolderPath(tmpDir, {
      blockedRoots: ['', tmpDir + '-other'],
    });
    expect(result).toBe(path.normalize(tmpDir));
  });
});
