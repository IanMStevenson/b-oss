// Fails if lowercase "blipfoto" appears in the rendered text of dist/*.html: the site writes "Blipfoto" (b-oss#861).
// Tags, scripts, styles and attributes are stripped first, so URLs and code do not count; a domain such as
// api.blipfoto.com is skipped too. Pages still to be brought in line are in ALLOWED: remove each when done.
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const ALLOWED = new Set(['status.html', 'how-this-works.html', 'b-ark-guide.html', 'b-ark-chrome-guide.html', 'b-mobile-guide.html']);
const problems = [];
for (const page of readdirSync(dist).filter((f) => f.endsWith('.html') && !ALLOWED.has(f))) {
  const text = readFileSync(join(dist, page), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
  for (const m of text.matchAll(/(?<![.\/@\w-])blipfoto(?![\w-]|\.com)/g))
    problems.push(`${page}: …${text.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, ' ')}…`);
}
if (problems.length) {
  console.error(`lowercase "blipfoto" in rendered text (write "Blipfoto"):\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('check-case: OK');
