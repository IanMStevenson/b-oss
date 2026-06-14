// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { PlatformIO } from '@b-oss/backup-engine';

const VIEWER_DIST_DIR = 'b-view-dist';

/**
 * Deploy the bundled standalone b-view viewer (index.html + b-view/ assets) and the backup
 * README into the journal folder, so the user can open `{username}/index.html` offline to
 * browse their archive, and AI tools find `{username}/README.md`. Mirrors the Electron app's
 * writeBViewFiles() ([packages/b-ark/src/main/b-view-files.ts]).
 *
 * The viewer tree is mirrored into the extension's `b-view-dist/` resources at build time by
 * scripts/copy-b-view.mjs, alongside a `files.json` manifest. We fetch each packaged file —
 * allowed because this runs in an extension page context — and write it via the FSA-backed io.
 *
 * Best-effort: any failure is logged and swallowed so deployment never fails a backup.
 */
export async function deployViewer(io: PlatformIO, username: string): Promise<void> {
  try {
    const manifestResp = await fetch(chrome.runtime.getURL(`${VIEWER_DIST_DIR}/files.json`));
    if (!manifestResp.ok) throw new Error(`files.json → ${manifestResp.status}`);
    const files = (await manifestResp.json()) as string[];

    for (const rel of files) {
      const resp = await fetch(chrome.runtime.getURL(`${VIEWER_DIST_DIR}/${rel}`));
      if (!resp.ok) throw new Error(`${rel} → ${resp.status}`);
      const bytes = new Uint8Array(await resp.arrayBuffer());
      await io.writeFile(`${username}/${rel}`, bytes);
    }
  } catch (err) {
    console.warn(
      `[b-ark] viewer deploy skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
