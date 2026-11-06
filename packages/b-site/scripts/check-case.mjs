// Fails if "Blipfoto" is capitalised anywhere in src: the site always writes it "blipfoto" (b-oss#861).
// Identifiers such as BlipfotoError don't match (word boundary). Add a file to ALLOWED only for a real exception.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ALLOWED = new Set(['src/blipfoto-links.ts']); // code comments, not site text
const hits = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(astro|ts|md|html|css)$/.test(e.name) && !ALLOWED.has(relative(root, p))) {
      readFileSync(p, 'utf8').split('\n').forEach((l, i) => {
        if (/\bBlipfoto\b/.test(l)) hits.push(`${relative(root, p)}:${i + 1}: ${l.trim()}`);
      });
    }
  }
};
walk(join(root, 'src'));
if (hits.length) {
  console.error(`"Blipfoto" must be lowercase on the site (see docs/design-patterns.md):\n${hits.join('\n')}`);
  process.exit(1);
}
