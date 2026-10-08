// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The in-app "Open source licences" page's data (SCR-29), generated from b-mobile's production
// dependency tree rather than kept by hand. `npm run build` regenerates it; run
// `node scripts/licences.mjs` after changing dependencies and commit the result.
// scripts/licences.test.mjs fails when the committed file no longer matches package-lock.json.
//
// The tree comes from package-lock.json, not from whatever happens to be in node_modules, so it is
// the same on every machine. It starts at b-mobile's `dependencies` (never devDependencies) and
// follows each package's dependencies and required peerDependencies, resolving them the way Node
// does (nearest node_modules first). optionalDependencies are skipped: in this tree they are
// per-platform build-tool binaries that never ship in the app, and which of them are installed
// differs by machine. @types/* packages hold no shipped code and are skipped too. Workspace
// packages (@b-oss/*) are walked through but not listed: they are this project's own GPL-3.0 code.
//
// Licence and notice texts are read from each package's own files in node_modules. A package
// that ships none uses the licence file of another package from the same repository if there is
// one (e.g. @ionic/react uses @ionic/core's), or, for MIT, the standard MIT text with the
// package.json author. Any other licence with no file stops the script, to be looked at by hand.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../../..');
const WORKSPACE = 'packages/b-mobile';
const OUT_PATH = path.join(
  __dirname,
  '../src/screens/SCR-29-help-and-info/licences.generated.json',
);

const LICENCE_FILE = /^(licen[cs]e|copying|notice)([-._].*)?$/i;

/** The lockfile path a dependency `name` resolves to from the package at `fromPath`. */
function resolveInLock(packages, fromPath, name) {
  const parts = fromPath ? fromPath.split('/') : [];
  for (let i = parts.length; i >= 0; i--) {
    if (i > 0 && parts[i - 1] === 'node_modules') continue;
    const prefix = parts.slice(0, i).join('/');
    const candidate = (prefix ? `${prefix}/` : '') + `node_modules/${name}`;
    if (packages[candidate]) return candidate;
  }
  return null;
}

/** Every third-party package in b-mobile's production tree: [{ name, version, path, license }],
 * one per name@version, sorted by name then version. */
export function productionPackages(lock) {
  const packages = lock.packages;
  const found = new Map();
  const visited = new Set();
  const queue = [WORKSPACE];

  while (queue.length > 0) {
    let lockPath = queue.shift();
    let entry = packages[lockPath];
    if (entry?.link) {
      lockPath = entry.resolved;
      entry = packages[lockPath];
    }
    if (!entry || visited.has(lockPath)) continue;
    visited.add(lockPath);

    const isWorkspace = !lockPath.includes('node_modules/');
    const name = entry.name ?? lockPath.slice(lockPath.lastIndexOf('node_modules/') + 13);
    if (!isWorkspace && !name.startsWith('@types/')) {
      const key = `${name}@${entry.version}`;
      if (!found.has(key)) {
        found.set(key, { name, version: entry.version, path: lockPath, license: entry.license });
      }
    }

    const optionalPeers = entry.peerDependenciesMeta ?? {};
    const optionalDeps = entry.optionalDependencies ?? {};
    const deps = [
      ...Object.keys(entry.dependencies ?? {}),
      ...Object.keys(entry.peerDependencies ?? {}).filter((n) => !optionalPeers[n]?.optional),
    ].filter((n) => !(n in optionalDeps));
    for (const dep of deps) {
      const resolved = resolveInLock(packages, lockPath, dep);
      if (!resolved) {
        throw new Error(`Cannot resolve ${dep} from ${lockPath || '(root)'} in package-lock.json`);
      }
      queue.push(resolved);
    }
  }

  return [...found.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
}

function readLicenceFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => LICENCE_FILE.test(f) && fs.statSync(path.join(dir, f)).isFile())
    .sort()
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim());
}

function repositoryUrl(pkgJson) {
  const repo = pkgJson.repository;
  const raw = typeof repo === 'string' ? repo : repo?.url;
  if (!raw) return pkgJson.homepage ?? null;
  const url = raw
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/^git:\/\//, 'https://');
  if (/^github:/.test(url)) return `https://github.com/${url.slice(7)}`;
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) return `https://github.com/${url}`;
  return url;
}

const MIT_BODY = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

function authorName(pkgJson) {
  const author = pkgJson.author;
  const raw = typeof author === 'string' ? author : author?.name;
  return raw ? raw.replace(/\s*[<(].*$/, '').trim() : null;
}

/** The JSON the licences page renders. Identical texts are stored once in `texts` and referenced
 * by index, since many packages ship the same file. */
export function buildLicences(lock, repoRoot = REPO_ROOT) {
  const texts = [];
  const textIndex = new Map();
  const intern = (text) => {
    if (!textIndex.has(text)) {
      textIndex.set(text, texts.length);
      texts.push(text);
    }
    return textIndex.get(text);
  };

  const read = productionPackages(lock).map((p) => {
    const dir = path.join(repoRoot, p.path);
    const pkgJsonPath = path.join(dir, 'package.json');
    const pkgJson = fs.existsSync(pkgJsonPath)
      ? JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'))
      : {};
    const rawLicense = p.license ?? pkgJson.license ?? 'UNKNOWN';
    return {
      name: p.name,
      version: p.version,
      license: typeof rawLicense === 'string' ? rawLicense : (rawLicense.type ?? 'UNKNOWN'),
      repository: repositoryUrl(pkgJson),
      author: authorName(pkgJson),
      files: readLicenceFiles(dir),
    };
  });

  const byRepository = new Map();
  for (const p of read) {
    if (p.repository && p.files.length && !byRepository.has(p.repository)) {
      byRepository.set(p.repository, p.files);
    }
  }

  const packages = read.map((p) => {
    let files = p.files;
    if (files.length === 0 && p.repository && byRepository.has(p.repository)) {
      files = byRepository.get(p.repository);
    } else if (files.length === 0 && p.license === 'MIT') {
      const holder = p.author ?? `the ${p.name} authors`;
      files = [
        `This package includes no licence file; its package.json declares the MIT License.\n\n` +
          `MIT License\n\nCopyright (c) ${holder}\n\n${MIT_BODY}`,
      ];
    } else if (files.length === 0) {
      throw new Error(`${p.name}@${p.version} (${p.license}) ships no licence file`);
    }
    return {
      name: p.name,
      version: p.version,
      license: p.license,
      repository: p.repository,
      texts: files.map(intern),
    };
  });
  return { packages, texts };
}

export function readLock(repoRoot = REPO_ROOT) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, 'package-lock.json'), 'utf8'));
}

export { OUT_PATH };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildLicences(readLock());
  // Through Prettier, as the pre-commit hook would, so a rebuild with unchanged dependencies
  // leaves the committed file byte-identical.
  const prettier = await import('prettier');
  const options = (await prettier.resolveConfig(OUT_PATH)) ?? {};
  const json = await prettier.format(JSON.stringify(result), { ...options, parser: 'json' });
  fs.writeFileSync(OUT_PATH, json);
  console.log(
    `licences: ${result.packages.length} packages, ${result.texts.length} distinct texts`,
  );
}
