// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Remembers, per account, the folder the photo picker last used (b-oss#739). Pure logic over
// injected file and dialog functions so it is unit-testable; index.ts supplies the real ones.
// Machine-local (userData); never part of a portable file.

import { dirname } from 'node:path';

export interface PhotoFolderDeps {
  readFile(): Promise<string | null>;
  writeFile(contents: string): Promise<void>;
  /** True if the folder exists now (it may be on a disconnected drive or deleted). */
  folderExists(path: string): Promise<boolean>;
  /** Shows the dialog; resolves with the chosen file path or null when cancelled. */
  openDialog(defaultPath: string | undefined): Promise<string | null>;
}

type FolderMap = Record<string, string>;

export function parseFolderMap(raw: string | null): FolderMap {
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const out: FolderMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value !== '') out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** Opens the picker in the account's last folder (if it still exists), remembers the folder of
 * whatever is chosen, and returns the chosen path (null on cancel). */
export async function pickPhotoForAccount(
  accountId: string,
  deps: PhotoFolderDeps,
): Promise<string | null> {
  const map = parseFolderMap(await deps.readFile().catch(() => null));
  const remembered = map[accountId];
  const start = remembered && (await deps.folderExists(remembered)) ? remembered : undefined;
  const chosen = await deps.openDialog(start);
  if (chosen === null) return null;
  map[accountId] = dirname(chosen);
  // A failure to remember must not lose the pick.
  await deps.writeFile(JSON.stringify(map)).catch(() => undefined);
  return chosen;
}
