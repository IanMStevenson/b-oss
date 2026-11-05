// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Diffs two flow-runner.mjs trace folders (the same flows run on two builds) and prints a markdown
// report: per flow, what differs in steps, final route, API request multiset, persisted state,
// console errors and notes. Request ORDER is not compared (only the multiset), because timing makes
// background calls interleave differently run to run.
//
//   node scripts/flow-diff.mjs <baselineDir> <candidateDir> [> report.md]

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [aDir, bDir] = process.argv.slice(2);
if (!aDir || !bDir) throw new Error('usage: flow-diff.mjs <baselineDir> <candidateDir>');

const load = (dir) =>
  Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith('.json') && f !== 'prefs-seed.json')
      .map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(dir, f), 'utf8'))]),
  );
const A = load(aDir);
const B = load(bDir);

const reqKey = (r) =>
  `${r.method} ${r.path} ${JSON.stringify(r.query)}${r.body ? ` body=${JSON.stringify(r.body)}` : ''}`;
const count = (list) => {
  const m = new Map();
  for (const k of list) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
};
function multisetDiff(a, b) {
  const ca = count(a);
  const cb = count(b);
  const out = [];
  for (const k of new Set([...ca.keys(), ...cb.keys()])) {
    const x = ca.get(k) ?? 0;
    const y = cb.get(k) ?? 0;
    if (x !== y) out.push(`${y > x ? '+' : '-'}${Math.abs(y - x)} \`${k}\``);
  }
  return out;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let total = 0;
const lines = [];
for (const id of [...new Set([...Object.keys(A), ...Object.keys(B)])].sort()) {
  const a = A[id];
  const b = B[id];
  if (!a || !b) {
    lines.push(`### ${id}\n- present in ${a ? 'baseline' : 'candidate'} only`);
    total++;
    continue;
  }
  const d = [];
  const stepsA = Object.fromEntries(
    a.steps.map((s) => [s.name, s.ok ? 'ok' : `FAIL (${s.error})`]),
  );
  const stepsB = Object.fromEntries(
    b.steps.map((s) => [s.name, s.ok ? 'ok' : `FAIL (${s.error})`]),
  );
  for (const k of new Set([...Object.keys(stepsA), ...Object.keys(stepsB)])) {
    if (stepsA[k] !== stepsB[k])
      d.push(
        `- step "${k}": baseline ${stepsA[k] ?? 'absent'}, candidate ${stepsB[k] ?? 'absent'}`,
      );
  }
  if (a.flowError !== b.flowError)
    d.push(`- flow error: baseline ${a.flowError}, candidate ${b.flowError}`);
  if (a.finalRoute !== b.finalRoute)
    d.push(`- final route: baseline \`${a.finalRoute}\`, candidate \`${b.finalRoute}\``);
  const rd = multisetDiff(a.requests.map(reqKey), b.requests.map(reqKey));
  if (rd.length)
    d.push(
      `- API requests (+ only in candidate, - only in baseline):\n${rd.map((x) => `  - ${x}`).join('\n')}`,
    );
  for (const k of new Set([...Object.keys(a.storage), ...Object.keys(b.storage)])) {
    if (k === 'b-mobile:device-prefs') continue; // format differs by design: see notes
    if (a.storage[k] !== b.storage[k]) {
      d.push(
        `- storage \`${k}\`:\n  - baseline: \`${String(a.storage[k]).slice(0, 400)}\`\n  - candidate: \`${String(b.storage[k]).slice(0, 400)}\``,
      );
    }
  }
  const ea = [...a.consoleErrors].sort();
  const eb = [...b.consoleErrors].sort();
  if (!same(ea, eb))
    d.push(`- console errors: baseline ${JSON.stringify(ea)}, candidate ${JSON.stringify(eb)}`);
  // Prefs: the persisted FORMAT changed by design (schema 2, overrides only), so compare what the
  // user gets (the twelve effective prefs), not the stored text; report the format change once.
  const PREF_KEYS = [
    'confirmAccountBeforeReaction',
    'reminders',
    'uploadFullSize',
    'openBlipfotoLinksInApp',
    'notificationPollingIntervalMinutes',
    'seenFirstRunExplainer',
    'showZoomBar',
    'showPagination',
    'thumbnailMargins',
    'thumbnailZoomPercent',
    'photoFit',
    'accountAvatarStyle',
    'theme',
  ];
  const project = (o) =>
    o && typeof o === 'object' ? Object.fromEntries(PREF_KEYS.map((k) => [k, o[k]])) : o;
  const storedFormat = /stored/;
  let storedDiffers = false;
  for (const k of new Set([...Object.keys(a.notes), ...Object.keys(b.notes)])) {
    if (storedFormat.test(k) && !same(a.notes[k], b.notes[k])) {
      storedDiffers = true;
      continue;
    }
    if (k.endsWith(' effective')) {
      if (!same(project(a.notes[k]), project(b.notes[k])))
        d.push(
          `- effective prefs \`${k}\`:\n  - baseline: \`${JSON.stringify(project(a.notes[k]))}\`\n  - candidate: \`${JSON.stringify(project(b.notes[k]))}\``,
        );
      continue;
    }
    if (!same(a.notes[k], b.notes[k])) {
      d.push(
        `- note \`${k}\`:\n  - baseline: \`${JSON.stringify(a.notes[k])?.slice(0, 500)}\`\n  - candidate: \`${JSON.stringify(b.notes[k])?.slice(0, 500)}\``,
      );
    }
  }
  if (storedDiffers)
    d.push(
      '- persisted prefs text differs between builds (candidate stores `{schema:2, overrides}`; baseline the full object): by design, effective values compared instead',
    );
  total += d.length ? 1 : 0;
  lines.push(
    `### ${id} — ${d.length ? `${d.length} difference(s)` : 'identical'}\n${d.join('\n')}`,
  );
}
console.log(
  `# Flow trace diff: ${aDir} (baseline) vs ${bDir} (candidate)\n\n${total} flow(s) differ.\n\n${lines.join('\n\n')}`,
);
