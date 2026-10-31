// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Build-time check that the repo-root .env.local has every key .env.example lists (b-oss#699).
// .env.local is gitignored, so a worktree's copy goes stale whenever .env.example gains a key, and the
// build then succeeds with a silently missing value (found 2026-10-31: no VITE_GEOAPIFY_KEY, so the map
// said "unavailable"). Names only: a value is never printed or returned.
//
//   node packages/b-mobile-pc/scripts/env-check.mjs [--warn-only] [--root <dir>]
//
// Exit 1 if a key that is not marked `# optional` in .env.example is missing or empty (unless
// --warn-only). A key set in the process environment counts as present, because vite reads that too.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The assignments in a dotenv-style file, in order. `value` is the unquoted value with any inline
 * comment removed; `comment` is the inline comment text ('' if none).
 * @param {string} text
 * @returns {{ name: string, value: string, comment: string }[]}
 */
export function parseEnvFile(text) {
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const name = line
      .slice(0, eq)
      .replace(/^export\s+/, '')
      .trim();
    if (!KEY.test(name)) continue;
    let rest = line.slice(eq + 1).trim();
    let comment = '';
    const quote = rest[0];
    if (quote === '"' || quote === "'") {
      const end = rest.indexOf(quote, 1);
      if (end !== -1) {
        const after = rest.slice(end + 1);
        rest = rest.slice(1, end);
        const hash = after.indexOf('#');
        comment = hash === -1 ? '' : after.slice(hash + 1).trim();
        out.push({ name, value: rest, comment });
        continue;
      }
    }
    // Unquoted: a comment starts at a '#' that begins the value or follows whitespace.
    const m = /(^|\s)#/.exec(rest);
    if (m) {
      comment = rest.slice(m.index + m[0].length).trim();
      rest = rest.slice(0, m.index).trim();
    }
    out.push({ name, value: rest, comment });
  }
  return out;
}

/**
 * The keys .env.example lists that `.env.local` (or the environment) leaves missing or empty.
 * @param {string} exampleText
 * @param {string} localText
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ required: string[], optional: string[] }}
 */
export function missingEnvKeys(exampleText, localText, env = {}) {
  const have = new Set(
    parseEnvFile(localText)
      .filter((e) => e.value !== '')
      .map((e) => e.name),
  );
  const required = [];
  const optional = [];
  const seen = new Set();
  for (const { name, comment } of parseEnvFile(exampleText)) {
    if (seen.has(name)) continue;
    seen.add(name);
    if (have.has(name) || (env[name] ?? '') !== '') continue;
    (/(^|\s)optional\b/i.test(comment) ? optional : required).push(name);
  }
  return { required, optional };
}

/** What the key being absent does, for the message. */
const EFFECTS = {
  VITE_BLIPFOTO_CLIENT_ID: 'sign-in will do nothing',
  VITE_GEOAPIFY_KEY: 'the map will show "unavailable"',
};

/**
 * The warning lines (names only), required ones first.
 * @param {{ required: string[], optional: string[] }} missing
 * @param {boolean} fileExists
 */
export function formatReport(missing, fileExists) {
  const lines = [];
  if (!fileExists) lines.push('warning: there is no .env.local at the repo root');
  for (const name of missing.required) {
    const effect = EFFECTS[name];
    lines.push(`warning: .env.local is missing ${name}${effect ? ` (${effect})` : ''}`);
  }
  for (const name of missing.optional) {
    lines.push(`note: .env.local has no ${name} (optional)`);
  }
  return lines;
}

function main(argv) {
  const warnOnly = argv.includes('--warn-only');
  const rootFlag = argv.indexOf('--root');
  const root =
    rootFlag === -1
      ? resolve(fileURLToPath(import.meta.url), '../../../..')
      : resolve(argv[rootFlag + 1] ?? '.');
  const read = (name) => {
    const path = resolve(root, name);
    return existsSync(path) ? readFileSync(path, 'utf8') : null;
  };
  const example = read('.env.example');
  if (example === null) {
    console.error('warning: no .env.example found; nothing to compare .env.local with');
    return 0;
  }
  const local = read('.env.local');
  const missing = missingEnvKeys(example, local ?? '', process.env);
  for (const line of formatReport(missing, local !== null)) console.error(line);
  if (missing.required.length === 0) return 0;
  if (warnOnly || process.env.BMPC_ALLOW_MISSING_ENV === '1') return 0;
  console.error(
    'Stopping: add the key(s) above to .env.local (compare with .env.example), or set BMPC_ALLOW_MISSING_ENV=1 to build anyway.',
  );
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
