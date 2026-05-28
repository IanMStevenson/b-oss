// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import fs from 'node:fs/promises';
import path from 'node:path';
import readmeContent from '../../backup-files/README.md?raw';

export async function writeBackupReadme(username: string, backupFolder: string): Promise<void> {
  const dest = path.join(backupFolder, username, 'README.md');
  await fs.writeFile(dest, readmeContent, 'utf8');
}
