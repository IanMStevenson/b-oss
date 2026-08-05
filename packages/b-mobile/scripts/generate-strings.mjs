// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Regenerates src/strings/deck.ts from docs/AppSpec/TextStrings.csv (TODO F's copy deck). Run
// manually with `node scripts/generate-strings.mjs` whenever the CSV changes — not part of the
// build, since the deck only moves when the spec does, not on every commit.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.join(__dirname, '../docs/AppSpec/TextStrings.csv');
const outPath = path.join(__dirname, '../src/strings/deck.ts');

/** RFC4180-ish parser: quoted fields, doubled-quote escaping, and literal newlines inside quoted
 * fields (several draft_text values are multi-paragraph) — a plain line-split can't handle those. */
function parseCsv(input) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const csv = fs.readFileSync(csvPath, 'utf8');
const rows = parseCsv(csv).filter((r) => r.length > 1 || r[0] !== '');
const [header, ...records] = rows;
const keyIndex = header.indexOf('key');
const textIndex = header.indexOf('draft_text');
if (keyIndex === -1 || textIndex === -1) {
  throw new Error('TextStrings.csv is missing a "key" or "draft_text" column.');
}

const entries = records.map((r) => [r[keyIndex], r[textIndex]]);

const seen = new Set();
for (const [key] of entries) {
  if (!key) throw new Error('TextStrings.csv has a row with an empty key.');
  if (seen.has(key)) throw new Error(`Duplicate key in TextStrings.csv: ${key}`);
  seen.add(key);
}

entries.sort((a, b) => a[0].localeCompare(b[0]));

const body = entries
  .map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`)
  .join('\n');

const output = `// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// GENERATED FILE — do not edit by hand.
// Source: docs/AppSpec/TextStrings.csv (TODO F's copy deck). Regenerate with:
//   node scripts/generate-strings.mjs

export const STRINGS = {
${body}
} as const;
`;

fs.writeFileSync(outPath, output);
console.log(`Wrote ${entries.length} strings to ${path.relative(process.cwd(), outPath)}`);
