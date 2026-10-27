// Post-build check: every relative href/src in dist/*.html must resolve to a built file, and every
// #fragment must match an id in the target page. Run via `npm run check-links` after a build.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const pages = readdirSync(dist).filter((f) => f.endsWith('.html'));
const ids = new Map(
  pages.map((f) => [
    f,
    new Set([...readFileSync(join(dist, f), 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])),
  ]),
);

const problems = [];
for (const page of pages) {
  const html = readFileSync(join(dist, page), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  for (const [, attr, url] of html.matchAll(/\s(href|src)="([^"]*)"/g)) {
    if (/^([a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(url) || url === '') continue; // external or root-absolute
    const [path, fragment] = url.split('#');
    const target = path || page;
    if (!existsSync(join(dist, target))) {
      problems.push(`${page}: ${attr}="${url}" -> missing ${target}`);
    } else if (fragment && target.endsWith('.html') && !ids.get(target)?.has(fragment))
      problems.push(`${page}: ${attr}="${url}" -> no #${fragment} in ${target}`);
  }
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`check-links: ${pages.length} pages OK`);
