#!/usr/bin/env node
// Mechanical pre-release checks for a release PR (b-oss#960). The agent preparing the release runs
//
//   node scripts/release-check.mjs <b-mobile|b-ark> <version> [--skip-audit]
//
// and reads a PASS / WARN / FAIL list (exit 1 on any FAIL). It checks what a machine can: version files,
// the release note, the changelog section, the generated licence lists (b-mobile), the Store listing
// limits (b-ark) and the dependency audit. It cannot judge whether the settings reference, user guides and
// store listings still match the app, or do the smoke test: RELEASING.md ("Preparing a release PR") covers
// those, and the output ends with a reminder of them.
//
// Families as in scripts/release-impact.mjs: b-mobile (b-mobile + b-mobile-pc), b-ark (b-ark + b-ark-chrome).

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkListing } from './check-store-listing.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_NOTE = 500;

const readJson = (root, rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));
const readText = (root, rel) =>
  existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : null;
const result = (status, name, detail = '') => ({ status, name, detail });
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The note under "## <version> - <date>" in a release-notes file, or null. */
export function noteFor(text, version) {
  if (text === null) return null;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex((l) =>
    new RegExp(`^## ${escapeRe(version)} - \\d{4}-\\d{2}-\\d{2}$`).test(l),
  );
  if (start < 0) return null;
  const end = lines.findIndex((l, i) => i > start && l.startsWith('#'));
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join('\n')
    .trim();
}

export function checkNote(root, product, version, { required = true } = {}) {
  const name = `release note for ${product} ${version}`;
  const text = readText(root, `packages/b-site/release-notes/${product}.md`);
  const note = noteFor(text, version);
  if (note === null)
    return result(
      required ? 'FAIL' : 'WARN',
      name,
      `no "## ${version} - <YYYY-MM-DD>" section in packages/b-site/release-notes/${product}.md`,
    );
  if (note === '') return result('FAIL', name, 'the section is empty');
  const length = [...note].length;
  if (length > MAX_NOTE)
    return result('FAIL', name, `${length} characters; the limit is ${MAX_NOTE}`);
  return result('PASS', name, `${length} characters`);
}

export function checkChangelog(root, heading) {
  const text = readText(root, 'CHANGELOG.md') ?? '';
  const re = new RegExp(`^## \\[${escapeRe(heading)}\\] - \\d{4}-\\d{2}-\\d{2}$`, 'm');
  return re.test(text)
    ? result('PASS', 'changelog section', `## [${heading}] is dated`)
    : result(
        'FAIL',
        'changelog section',
        `no dated "## [${heading}] - <YYYY-MM-DD>" section in CHANGELOG.md`,
      );
}

function versionFile(root, rel, version, { majorMinor = false } = {}) {
  const name = `version in ${rel}`;
  let actual;
  try {
    actual = readJson(root, rel).version;
  } catch {
    return result('FAIL', name, 'file missing or unreadable');
  }
  const cut = (v) => (majorMinor ? String(v).split('.').slice(0, 2).join('.') : v);
  if (cut(actual) === cut(version)) return result('PASS', name, actual);
  return result(
    'FAIL',
    name,
    `is ${actual}, expected ${majorMinor ? 'major.minor of ' : ''}${version}`,
  );
}

export function checkVersions(root, family, version) {
  if (family === 'b-mobile')
    return [
      versionFile(root, 'packages/b-mobile/package.json', version),
      // b-mobile-pc tracks b-mobile in major.minor only (a test enforces this).
      versionFile(root, 'packages/b-mobile-pc/package.json', version, { majorMinor: true }),
    ];
  return [
    versionFile(root, 'package.json', version),
    versionFile(root, 'packages/b-ark/package.json', version),
    versionFile(root, 'packages/b-ark-chrome/package.json', version),
    versionFile(root, 'packages/b-ark-chrome/manifest.json', version),
  ];
}

function run(name, cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  const tail = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-3).join(' | ');
  return r.status === 0 ? result('PASS', name) : result('FAIL', name, tail || `exit ${r.status}`);
}

export const REMINDERS = [
  'Settings reference, user guide and store listing still match what changed since the last tag (judgement pass in RELEASING.md).',
  'Smoke test the built artefact on a clean machine or profile, including signing in.',
  'Paste the release note into each store ("What\'s new") when you upload.',
  'Approve the tag run in GitHub, then upload the artefacts by hand.',
];

export function checkFamily(root, family, version, { audit = true, runExternal = true } = {}) {
  const out = [];
  if (!/^\d+\.\d+\.\d+$/.test(version))
    return [result('FAIL', 'version', `"${version}" is not x.y.z`)];
  out.push(...checkVersions(root, family, version));
  if (family === 'b-mobile') {
    out.push(checkNote(root, 'b-mobile', version));
    out.push(checkNote(root, 'b-mobile-pc', version, { required: false }));
    out.push(checkChangelog(root, `b-mobile ${version}`));
    if (runExternal)
      out.push(
        run(
          'generated licence lists current',
          'npm',
          ['run', 'licences:check', '-w', '@b-oss/b-mobile'],
          root,
        ),
      );
  } else {
    out.push(checkNote(root, 'b-ark', version));
    // A b-ark-v* tag also builds the Chrome zip, but the extension is only published when Ian uploads it.
    out.push(checkNote(root, 'b-ark-chrome', version, { required: false }));
    out.push(checkChangelog(root, version));
    const listing = readText(root, 'packages/b-ark/store/listing.md');
    if (listing === null)
      out.push(result('WARN', 'b-ark store listing', 'packages/b-ark/store/listing.md not found'));
    else {
      const problems = checkListing(listing);
      out.push(
        problems.length
          ? result('FAIL', 'b-ark store listing within Partner Center limits', problems.join('; '))
          : result('PASS', 'b-ark store listing within Partner Center limits'),
      );
    }
  }
  if (audit && runExternal)
    out.push(
      run(
        'npm audit (production, high)',
        'npm',
        ['audit', '--omit=dev', '--audit-level=high'],
        root,
      ),
    );
  return out;
}

function main(argv) {
  const [family, version] = argv;
  if (!['b-mobile', 'b-ark'].includes(family) || !version) {
    console.error('usage: release-check.mjs <b-mobile|b-ark> <x.y.z> [--skip-audit]');
    process.exit(2);
  }
  const results = checkFamily(ROOT, family, version, { audit: !argv.includes('--skip-audit') });
  for (const r of results)
    console.log(`${r.status.padEnd(4)}  ${r.name}${r.detail ? ` - ${r.detail}` : ''}`);
  console.log('\nStill for a human (the script cannot judge these):');
  for (const m of REMINDERS) console.log(`  - ${m}`);
  if (results.some((r) => r.status === 'FAIL')) process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main(process.argv.slice(2));
