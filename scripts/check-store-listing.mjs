// Checks packages/b-ark/store/listing.md against Partner Center field limits.
// Usage: node scripts/check-store-listing.mjs [path-to-listing.md]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DEFAULT = new URL('../packages/b-ark/store/listing.md', import.meta.url);

/** First fenced block under the first heading whose text starts with `prefix`. */
export function block(md, prefix) {
  const lines = md.split('\n');
  const h = lines.findIndex((l) => /^#{2,4} /.test(l) && l.replace(/^#+ /, '').startsWith(prefix));
  if (h < 0) return null;
  const open = lines.findIndex((l, i) => i > h && l.startsWith('```'));
  if (open < 0) return null;
  const close = lines.findIndex((l, i) => i > open && l.startsWith('```'));
  return lines.slice(open + 1, close < 0 ? undefined : close).join('\n');
}

const len = (s) => [...s].length;

/** Returns a list of problem strings; empty when the listing is within limits. */
export function checkListing(md) {
  const problems = [];
  const need = (name, text) => {
    if (text === null || text.trim() === '') problems.push(`${name}: missing or empty`);
    return text ?? '';
  };
  const max = (name, text, limit) => {
    if (len(text) > limit) problems.push(`${name}: ${len(text)} characters, limit ${limit}`);
  };
  const noMarkup = (name, text) => {
    if (/https?:\/\/|www\./i.test(text)) problems.push(`${name}: contains a URL`);
    if (/<\/?[a-z][^>]*>/i.test(text)) problems.push(`${name}: contains HTML`);
  };
  const noMarker = (name, text) => {
    if (/IAN TO CONFIRM/.test(text)) problems.push(`${name}: unresolved IAN TO CONFIRM marker`);
  };

  const full = need('runFullTrust justification', block(md, 'Submission options'));
  max('runFullTrust justification', full, 450);

  const short = need('Short description', block(md, 'Short description'));
  max('Short description', short, 270);

  const desc = need('Description', block(md, 'Description (plain'));
  max('Description', desc, 10000);
  noMarkup('Description', desc);

  const feats = need('Product features', block(md, 'Product features'))
    .split('\n')
    .filter((l) => l.trim() !== '');
  if (feats.length > 20) problems.push(`Product features: ${feats.length} items, limit 20`);
  feats.forEach((f, i) => {
    max(`Product feature ${i + 1}`, f, 200);
    if (/^\s*[-*•·]/.test(f)) problems.push(`Product feature ${i + 1}: starts with a bullet`);
  });

  const notes = need('Notes for certification', block(md, 'Notes for certification'));
  max('Notes for certification', notes, 1500);

  // Release gate: markers must be cleared before pasting into Partner Center.
  if (process.env.STORE_LISTING_FINAL === '1') {
    noMarker('Description', desc);
    noMarker('Notes for certification', notes);
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = process.argv[2] ?? DEFAULT;
  const problems = checkListing(readFileSync(path, 'utf8'));
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log('Store listing within Partner Center limits.');
}
