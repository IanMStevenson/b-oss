// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import { createRequire } from 'node:module';

const requireFrom = createRequire(import.meta.url);

function resolveBviewDist(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'b-view');
  }
  const pkgJsonPath = requireFrom.resolve('@b-oss/b-view/package.json');
  return path.join(path.dirname(pkgJsonPath), 'dist-app');
}

export async function writeBViewFiles(username: string, backupFolder: string): Promise<void> {
  const src = resolveBviewDist();
  const dest = path.join(backupFolder, username);

  try {
    await fs.access(src);
  } catch {
    throw new Error(
      `b-view dist not found at ${src} — run "npm run build --workspace=packages/b-view"`,
    );
  }

  await copyDir(src, dest);
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
