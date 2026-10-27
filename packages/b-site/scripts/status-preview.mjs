// Builds self-contained status-page previews that open straight from disk (file://) in a browser:
// one HTML file per fixture state plus the "How this works" page, each with its CSS and JavaScript
// inlined and the fixture data embedded, no network calls. For design review only.
//
//   npm run preview:status -w @b-oss/b-site -- [--out <dir>] [--no-build]
//
// The production bundle is untouched: the page script is re-bundled here from scripts/
// status-preview-entry.ts (which pulls in the fixtures); the site build never includes it.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = resolve(outIndex >= 0 ? (args[outIndex + 1] ?? '') : join(root, 'dist-preview'));
const dist = join(root, 'dist');

if (!args.includes('--no-build')) {
  const r = spawnSync('npx', ['astro', 'build'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// One classic (IIFE) script: module scripts and chunks don't load from file://.
const result = await build({
  root,
  configFile: false,
  logLevel: 'warn',
  build: {
    write: false,
    minify: true,
    lib: {
      entry: join(root, 'scripts/status-preview-entry.ts'),
      name: 'StatusPreview',
      formats: ['iife'],
      fileName: () => 'status-preview.js',
    },
  },
});
const outputs = Array.isArray(result) ? result.flatMap((r) => r.output) : result.output;
const chunk = outputs.find((o) => o.type === 'chunk');
if (!chunk || chunk.type !== 'chunk') throw new Error('preview bundle not produced');
const js = chunk.code.replaceAll('</script', '<\\/script');
const css = readFileSync(join(dist, 'site.css'), 'utf8');

const STATES = [
  'all-good',
  'api-down',
  'website-down',
  'both-down',
  'busy',
  'new',
  'unknown',
  'stale',
];

function inline(file, { fixture } = {}) {
  let html = readFileSync(join(dist, file), 'utf8');
  html = html
    .replace(/<link rel="stylesheet" href="site\.css"\s*\/?>/, () => `<style>${css}</style>`)
    // Social/icon/manifest links point at files that aren't beside a preview.
    .replace(/<link rel="(icon|apple-touch-icon|manifest|canonical)"[^>]*>/g, '')
    .replace(/<script type="module" src="[^"]*"><\/script>/g, '')
    .replaceAll('href="status.html"', 'href="status-all-good.html"');
  if (fixture) {
    html = html
      .replace('<html lang="en"', `<html lang="en" data-fixture="${fixture}"`)
      .replace('</body>', () => `<script>${js}</script></body>`);
  }
  return html;
}

mkdirSync(out, { recursive: true });
const written = [];
for (const state of STATES) {
  const name = `status-${state}.html`;
  writeFileSync(join(out, name), inline('status.html', { fixture: state }));
  written.push(name);
}
writeFileSync(join(out, 'how-this-works.html'), inline('how-this-works.html'));
written.push('how-this-works.html');
console.log(`status-preview: wrote ${written.length} files to ${out}`);
