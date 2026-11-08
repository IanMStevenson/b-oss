import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkChangelog, checkFamily, checkNote, noteFor } from './release-check.mjs';

function fixture(files) {
  const root = mkdtempSync(join(tmpdir(), 'release-check-'));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), typeof text === 'string' ? text : JSON.stringify(text));
  }
  return root;
}
const by = (results, fragment) => results.find((r) => r.name.includes(fragment));

describe('noteFor', () => {
  const md = '## 1.4.0 - 2026-11-10\n\nNew thing.\n\n## 1.3.0 - 2026-11-05\n\nOld.\n';
  it('finds the section for a version', () => expect(noteFor(md, '1.4.0')).toBe('New thing.'));
  it('is null for a missing version', () => expect(noteFor(md, '1.5.0')).toBeNull());
  it('does not match 1.4.0 for 1.4', () => expect(noteFor(md, '1.4')).toBeNull());
});

describe('checkNote', () => {
  it('fails over 500 characters', () => {
    const root = fixture({
      'packages/b-site/release-notes/b-ark.md': `## 1.0.8 - 2026-11-10\n\n${'x'.repeat(501)}\n`,
    });
    expect(checkNote(root, 'b-ark', '1.0.8').status).toBe('FAIL');
  });
  it('warns, not fails, when an optional product has no note', () => {
    const root = fixture({});
    expect(checkNote(root, 'b-mobile-pc', '1.4.0', { required: false }).status).toBe('WARN');
  });
});

describe('checkChangelog', () => {
  it('requires a dated section', () => {
    const root = fixture({ 'CHANGELOG.md': '## [Unreleased]\n\n## [b-mobile 1.4.0]\n' });
    expect(checkChangelog(root, 'b-mobile 1.4.0').status).toBe('FAIL');
  });
});

describe('checkFamily', () => {
  const ark = (v) => ({
    'package.json': { version: v },
    'packages/b-ark/package.json': { version: v },
    'packages/b-ark-chrome/package.json': { version: v },
    'packages/b-ark-chrome/manifest.json': { version: v },
    'packages/b-site/release-notes/b-ark.md': `## ${v} - 2026-11-10\n\nFixed things.\n`,
    'packages/b-site/release-notes/b-ark-chrome.md': `## ${v} - 2026-11-10\n\nFixed things.\n`,
    'CHANGELOG.md': `## [${v}] - 2026-11-10\n`,
  });
  const opts = { runExternal: false };

  it('passes a consistent b-ark release (store listing aside)', () => {
    const r = checkFamily(fixture(ark('1.0.8')), 'b-ark', '1.0.8', opts);
    expect(r.filter((x) => x.status === 'FAIL')).toEqual([]);
  });

  it('fails when one version file disagrees', () => {
    const files = ark('1.0.8');
    files['packages/b-ark-chrome/manifest.json'] = { version: '1.0.7' };
    const r = checkFamily(fixture(files), 'b-ark', '1.0.8', opts);
    expect(by(r, 'manifest.json').status).toBe('FAIL');
  });

  it('compares b-mobile-pc on major.minor only', () => {
    const root = fixture({
      'packages/b-mobile/package.json': { version: '1.4.1' },
      'packages/b-mobile-pc/package.json': { version: '1.4.0' },
      'packages/b-site/release-notes/b-mobile.md': '## 1.4.1 - 2026-11-10\n\nNew.\n',
      'CHANGELOG.md': '## [b-mobile 1.4.1] - 2026-11-10\n',
    });
    const r = checkFamily(root, 'b-mobile', '1.4.1', opts);
    expect(r.filter((x) => x.status === 'FAIL')).toEqual([]);
    expect(by(r, 'b-mobile-pc 1.4.1').status).toBe('WARN');
  });

  it('warns, not fails, when b-ark-chrome has no note for the version', () => {
    const files = ark('1.0.8');
    delete files['packages/b-site/release-notes/b-ark-chrome.md'];
    const r = checkFamily(fixture(files), 'b-ark', '1.0.8', opts);
    expect(by(r, 'b-ark-chrome 1.0.8').status).toBe('WARN');
    expect(r.filter((x) => x.status === 'FAIL')).toEqual([]);
  });

  it('rejects a malformed version', () => {
    expect(checkFamily(fixture({}), 'b-ark', '1.0', opts)[0].status).toBe('FAIL');
  });
});
