#!/usr/bin/env node
// Release impact map (b-oss#959): which release tags does a change need?
//
//   node scripts/release-impact.mjs [--json]
//       For each tag family, diff HEAD against that family's latest tag and say whether a release
//       is needed and which builds it makes.
//   node scripts/release-impact.mjs --files a,b,c [--json]
//       The same answer for an explicit list of changed files (repo-relative).
//   node scripts/release-impact.mjs --since <ref> [--json]
//       Diff HEAD against one ref for every family.
//
// A tag builds a whole family: b-mobile-v* the Android bundle and the b-mobile-pc Store MSIX,
// b-ark-v* the b-ark Store MSIX and the b-ark-chrome zip (RELEASING.md). b-site, b-push and
// b-status deploy from main with no tag and are not tracked here.
//
// "Affected" reuses scripts/ci-scope.mjs, so a change anywhere upstream (b-api, backup-engine,
// b-view, ...) reaches every product that depends on it. The one addition is the pair of edges CI
// does not need: b-mobile-pc packages b-mobile's built dist/ and the shared native add-on as files,
// not as package dependencies, so a change in either still means a new b-mobile-pc build.

import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { affectedPackages, loadGraph } from './ci-scope.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const FAMILIES = [
  {
    name: 'b-mobile',
    tagGlob: 'b-mobile-v*',
    products: ['b-mobile', 'b-mobile-pc'],
    builds: ['Android bundle (Play)', 'b-mobile-pc Store MSIX'],
  },
  {
    name: 'b-ark',
    tagGlob: 'b-ark-v*',
    products: ['b-ark', 'b-ark-chrome'],
    builds: ['b-ark Store MSIX', 'b-ark-chrome zip (Chrome Web Store)'],
  },
];

// Packages consumed as built files, not as imports, so the dependency graph cannot see them.
const FILE_DEPENDENCIES = [
  ['b-mobile-pc', 'b-mobile'],
  ['b-mobile-pc', 'b-win-startup'],
  ['b-ark', 'b-win-startup'],
];

export function releaseGraph(graph = loadGraph()) {
  const g = new Map([...graph].map(([k, v]) => [k, new Set(v)]));
  for (const [pkg, dep] of FILE_DEPENDENCIES) if (g.has(pkg) && g.has(dep)) g.get(pkg).add(dep);
  return g;
}

/** For changed files: per family, the changed products' reason and whether a release is needed. */
export function impact(files, graph = releaseGraph()) {
  const affected = new Set(affectedPackages(files, graph));
  return FAMILIES.map((f) => {
    const hit = f.products.filter((p) => affected.has(p));
    return {
      family: f.name,
      tag: f.tagGlob,
      needed: hit.length > 0,
      products: hit,
      builds: f.builds,
    };
  });
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

export function latestTag(glob) {
  const tags = git(['tag', '--list', glob, '--sort=-version:refname'])
    .split('\n')
    .filter((t) => t && !/-v[^-]*-/.test(t)); // ignore pre-release tags such as b-mobile-v1.2.3-rc1
  return tags[0] ?? null;
}

const changedSince = (ref) => git(['diff', '--name-only', ref, 'HEAD']).split('\n').filter(Boolean);

function main(argv) {
  const opt = (n) => {
    const i = argv.indexOf(n);
    return i === -1 ? undefined : argv[i + 1];
  };
  const json = argv.includes('--json');
  const graph = releaseGraph();
  const results = [];
  if (opt('--files')) {
    for (const r of impact(opt('--files').split(',').filter(Boolean), graph))
      results.push({ ...r, since: null });
  } else {
    for (const f of FAMILIES) {
      const since = opt('--since') ?? latestTag(f.tagGlob);
      if (!since) {
        results.push({
          family: f.name,
          tag: f.tagGlob,
          since: null,
          needed: true,
          products: f.products,
          builds: f.builds,
          note: 'no previous tag found',
        });
        continue;
      }
      const r = impact(changedSince(since), graph).find((x) => x.family === f.name);
      results.push({ ...r, since });
    }
  }
  if (json) return console.log(JSON.stringify(results, null, 2));
  for (const r of results) {
    const base = r.since ? ` since ${r.since}` : '';
    console.log(
      r.needed
        ? `${r.family}: release needed${base} (${r.products.join(', ')} affected) -> tag ${r.tag}: ${r.builds.join(' + ')}`
        : `${r.family}: nothing to release${base}`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2));
