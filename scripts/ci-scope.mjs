#!/usr/bin/env node
// Scopes CI work to the packages a change can affect (b-oss#557).
//
//   node scripts/ci-scope.mjs plan [--base <sha>]
//       Print the affected packages for `git diff <base> HEAD` as JSON; with $GITHUB_OUTPUT set,
//       also write `packages=<comma list>`. No --base (or an unusable one) means everything.
//   node scripts/ci-scope.mjs run <typecheck|lint|test> [--packages a,b,c|all]
//       Run that task for just those packages (default: all). An empty list is a no-op.
//
// "Affected" = the packages whose files changed plus everything that depends on them, transitively.
// The dependency graph is the union of declared package.json deps and `@b-oss/*` imports found in
// source, so an undeclared import still counts. Anything outside packages/ that can influence
// every package (root config, lockfile, types/, this script, ci.yml) selects everything, and so
// does any root file we do not recognise as inert: the failure mode is a slower run, never a
// skipped check.

import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Root files that cannot change what typecheck/lint/test do. Everything else outside packages/
// is treated as affecting all packages.
const INERT = [
  /^[^/]+\.md$/,
  /^LICENSE$/,
  /^\.gitignore$/,
  /^\.prettierrc$/,
  /^\.env\.example$/,
  /^assets\//,
  /^signatures\//,
  /^\.claude\//,
  /^\.vscode\//,
  /^\.husky\//,
  /^\.github\/(?!workflows\/ci\.yml$)/,
];

// Read by the root vitest config as a setup file for every package's tests.
const GLOBAL_FILES = ['packages/b-mobile/src/test-setup.ts'];

// Packages checked with `tsc --build`, in dependency order: later ones need the earlier ones'
// emitted dist/ (their package `main` points at it), so a scoped run builds the upstream closure.
const BUILD_GROUP = [
  'b-api',
  'backup-engine',
  'b-ark-ui-components',
  'b-ark-ui-electron',
  'b-ark',
  'b-ark-ui-chrome',
];

// Packages checked with `tsc -p … --noEmit`, in the order the root script always ran them.
const NO_EMIT = [
  ['b-visual', ['packages/b-visual']],
  ['b-view', ['packages/b-view']],
  ['b-view-backup', ['packages/b-view-backup']],
  ['b-ark-chrome', ['packages/b-ark-chrome']],
  ['b-mobile', ['packages/b-mobile', 'packages/b-mobile/tsconfig.node.json']],
  ['b-notify-core', ['packages/b-notify-core']],
  ['b-push', ['packages/b-push']],
  ['b-status', ['packages/b-status']],
];

const SCAN_EXT = /\.(?:[cm]?[jt]sx?)$/;

function scanImports(dir, found) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!/^(node_modules|dist|dist-app|android|\.astro)$/.test(entry.name))
        scanImports(full, found);
    } else if (SCAN_EXT.test(entry.name)) {
      for (const m of readFileSync(full, 'utf8').matchAll(/['"]@b-oss\/([a-z-]+)/g))
        found.add(m[1]);
    }
  }
}

/** Map of package dir name -> Set of workspace dir names it depends on. */
export function loadGraph(root = ROOT) {
  const pkgsDir = join(root, 'packages');
  const dirs = readdirSync(pkgsDir).filter((d) => existsSync(join(pkgsDir, d, 'package.json')));
  const byName = new Map();
  const manifests = new Map();
  for (const d of dirs) {
    const manifest = JSON.parse(readFileSync(join(pkgsDir, d, 'package.json'), 'utf8'));
    manifests.set(d, manifest);
    byName.set(manifest.name, d);
  }
  const graph = new Map();
  for (const d of dirs) {
    const m = manifests.get(d);
    const deps = new Set();
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
      for (const name of Object.keys(m[field] ?? {}))
        if (byName.has(name)) deps.add(byName.get(name));
    }
    const scanned = new Set();
    const pkgDir = join(pkgsDir, d);
    for (const entry of readdirSync(pkgDir, { withFileTypes: true })) {
      if (entry.isFile() && SCAN_EXT.test(entry.name)) {
        for (const x of readFileSync(join(pkgDir, entry.name), 'utf8').matchAll(
          /['"]@b-oss\/([a-z-]+)/g,
        )) {
          scanned.add(x[1]);
        }
      }
    }
    if (existsSync(join(pkgDir, 'src'))) scanImports(join(pkgDir, 'src'), scanned);
    for (const s of scanned) if (dirs.includes(s)) deps.add(s);
    deps.delete(d);
    graph.set(d, deps);
  }
  return graph;
}

function closure(seed, edges) {
  const out = new Set(seed);
  const queue = [...seed];
  while (queue.length) {
    for (const next of edges(queue.pop())) {
      if (!out.has(next)) {
        out.add(next);
        queue.push(next);
      }
    }
  }
  return out;
}

const upstream = (graph, pkgs) => closure(pkgs, (p) => graph.get(p) ?? []);
const downstream = (graph, pkgs) =>
  closure(pkgs, (p) => [...graph].filter(([, deps]) => deps.has(p)).map(([d]) => d));

/** Packages affected by a set of changed file paths (repo-relative, forward slashes). */
export function affectedPackages(files, graph) {
  const all = [...graph.keys()].sort();
  const touched = new Set();
  for (const file of files) {
    const m = /^packages\/([^/]+)\//.exec(file);
    if (GLOBAL_FILES.includes(file)) return all;
    if (m && graph.has(m[1])) touched.add(m[1]);
    else if (m || !INERT.some((re) => re.test(file))) return all;
  }
  return [...downstream(graph, touched)].sort();
}

/** The tsc invocations (each an argv for tsc) that typecheck these packages. */
export function typecheckSteps(pkgs, graph) {
  const set = new Set(pkgs);
  const needed = upstream(graph, set);
  const steps = [];
  const build = BUILD_GROUP.filter((p) => needed.has(p));
  if (build.length) steps.push(['--build', ...build.map((p) => `packages/${p}`)]);
  for (const [pkg, projects] of NO_EMIT) {
    if (set.has(pkg)) for (const p of projects) steps.push(['-p', p, '--noEmit']);
  }
  return steps;
}

const bin = (p) => join(ROOT, 'node_modules', p);

function run(script, args) {
  const r = spawnSync(process.execPath, [script, ...args], { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function runTask(task, pkgs, graph) {
  const isAll = pkgs.length === graph.size;
  if (pkgs.length === 0) {
    console.log(`ci-scope: no affected packages, skipping ${task}`);
    return;
  }
  console.log(`ci-scope: ${task} for ${isAll ? 'all packages' : pkgs.join(', ')}`);
  const steps = typecheckSteps(pkgs, graph);
  if (task === 'typecheck') {
    for (const step of steps) run(bin('typescript/bin/tsc'), step);
  }
  if (task === 'lint') {
    // Type-aware lint rules resolve upstream packages through their built dist/, so build first.
    for (const step of steps.filter((s) => s[0] === '--build'))
      run(bin('typescript/bin/tsc'), step);
    const globs = isAll
      ? ['packages/**/*.{ts,tsx}']
      : pkgs.map((p) => `packages/${p}/**/*.{ts,tsx}`);
    run(bin('eslint/bin/eslint.js'), [
      '--max-warnings',
      '0',
      '--no-error-on-unmatched-pattern',
      ...globs,
    ]);
  } else if (task === 'test') {
    // Trailing slash so `packages/b-view/` does not also match packages/b-view-backup/.
    run(bin('vitest/vitest.mjs'), ['run', ...(isAll ? [] : pkgs.map((p) => `packages/${p}/`))]);
  }
}

function changedFiles(base) {
  try {
    return execFileSync('git', ['diff', '--name-only', base, 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
  } catch {
    return null; // base not fetched / unreachable (e.g. force-push): fall back to everything
  }
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const opt = (name) => {
    const i = rest.indexOf(name);
    return i === -1 ? undefined : rest[i + 1];
  };
  const graph = loadGraph();
  if (cmd === 'plan') {
    const base = opt('--base');
    const files = base && !/^0+$/.test(base) ? changedFiles(base) : null;
    const pkgs = files ? affectedPackages(files, graph) : [...graph.keys()].sort();
    console.log(JSON.stringify({ changed: files?.length ?? null, packages: pkgs }));
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(process.env.GITHUB_OUTPUT, `packages=${pkgs.join(',')}\n`);
  } else if (cmd === 'run' && ['typecheck', 'lint', 'test'].includes(rest[0])) {
    const arg = opt('--packages') ?? 'all';
    const pkgs = arg === 'all' ? [...graph.keys()].sort() : arg.split(',').filter(Boolean);
    for (const p of pkgs) if (!graph.has(p)) throw new Error(`unknown package: ${p}`);
    runTask(rest[0], pkgs, graph);
  } else {
    console.error(
      'usage: ci-scope.mjs plan [--base <sha>] | run <typecheck|lint|test> [--packages a,b|all]',
    );
    process.exit(2);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2));
