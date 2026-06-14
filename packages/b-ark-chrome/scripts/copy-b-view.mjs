// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Mirrors the built standalone b-view viewer (packages/b-view/dist-app/) into this
// extension's public/ folder as b-view-dist/, plus a files.json manifest listing every
// file. Vite emits public/ verbatim to dist/, so the viewer ships at
// chrome-extension://<id>/b-view-dist/... and BrowserBackend deploys it into the user's
// backup folder via deployViewer(). The copy is gitignored — b-view is the single source.
// Run by this package's build/dev/dist scripts, after b-view itself has been built.

import { cpSync, rmSync, mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, relative } from 'node:path';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(packageRoot, '../b-view/dist-app');
const dest = resolve(packageRoot, 'public/b-view-dist');

if (!existsSync(src)) {
  console.error(
    `[copy-b-view] b-view dist not found at ${src} — run "npm run build --workspace=packages/b-view" first`,
  );
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });

// Walk the mirrored tree and record every file as a forward-slash relative path.
function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(abs));
    } else {
      out.push(relative(dest, abs).split('\\').join('/'));
    }
  }
  return out;
}

const files = listFiles(dest).sort();
writeFileSync(resolve(dest, 'files.json'), JSON.stringify(files, null, 2));

console.log(`[copy-b-view] b-view/dist-app → public/b-view-dist (${files.length} files)`);
