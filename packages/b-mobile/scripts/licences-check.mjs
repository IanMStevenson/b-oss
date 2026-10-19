// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Release-time check: the committed licences file must list exactly the production packages
// package-lock.json describes. Fix a failure with `npm run licences:generate -w packages/b-mobile`
// and commit the result. Deliberately not part of the per-PR test run (see licences.test.mjs).

import fs from 'node:fs';
import { OUT_PATH, productionPackages, readLock } from './licences.mjs';

const generated = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
const key = (p) => `${p.name}@${p.version}`;
const expected = productionPackages(readLock()).map(key);
const actual = generated.packages.map(key);

const missing = expected.filter((k) => !actual.includes(k));
const extra = actual.filter((k) => !expected.includes(k));

if (missing.length || extra.length) {
  console.error('licences.generated.json is out of date with package-lock.json.');
  if (missing.length) console.error(`  missing: ${missing.join(', ')}`);
  if (extra.length) console.error(`  stale:   ${extra.join(', ')}`);
  console.error('Run: npm run licences:generate -w packages/b-mobile  (then commit the file)');
  process.exit(1);
}
console.log(`licences: up to date (${actual.length} packages)`);
