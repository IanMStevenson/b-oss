// Post-build check: every old-URL stub must point at a page that exists in dist/, so a page can't
// be renamed or removed without updating stubs/redirects.mjs. Run after `npm run build`.
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NEW_ORIGIN, redirects } from '../stubs/redirects.mjs';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const problems = [];
for (const [from, to] of Object.entries(redirects)) {
  if (!to.startsWith(NEW_ORIGIN + '/')) problems.push(`${from} -> ${to}: not on ${NEW_ORIGIN}`);
  const path = to.slice(NEW_ORIGIN.length + 1) || 'index.html';
  if (!existsSync(join(dist, path))) problems.push(`${from} -> ${to}: ${path} is not in dist/`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`check-stubs: ${Object.keys(redirects).length} stubs OK`);
