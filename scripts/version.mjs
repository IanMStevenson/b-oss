// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8'));
const baseVersion = pkg.version;

function getCommitCount() {
  try {
    const out = execFileSync('git', ['rev-list', '--count', 'HEAD'], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return parseInt(out.toString().trim(), 10) || 0;
  } catch {
    return 0;
  }
}

function bumpBuildCounter() {
  const counterPath = resolve(repoRoot, '.build-counter');
  const current = existsSync(counterPath)
    ? parseInt(readFileSync(counterPath, 'utf8').trim(), 10) || 0
    : 0;
  const next = current + 1;
  writeFileSync(counterPath, String(next), 'utf8');
  return next;
}

const isRelease = process.env.RELEASE === '1';
const version = isRelease
  ? baseVersion
  : `${baseVersion}.${getCommitCount()}.${bumpBuildCounter()}`;

const outPath = resolve(repoRoot, 'version.generated.json');
writeFileSync(outPath, JSON.stringify({ version, isRelease }, null, 2) + '\n', 'utf8');

console.log(`version.generated.json → ${version}${isRelease ? ' (release)' : ''}`);
