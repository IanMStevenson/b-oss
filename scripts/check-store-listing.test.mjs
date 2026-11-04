import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { block, checkListing } from './check-store-listing.mjs';

const real = readFileSync(new URL('../packages/b-ark/store/listing.md', import.meta.url), 'utf8');
const fence = '```';
const doc = (desc, feats = 'one\ntwo') =>
  [
    '## Submission options',
    `${fence}\nok\n${fence}`,
    '### Short description',
    `${fence}\nshort\n${fence}`,
    '### Description (plain)',
    `${fence}\n${desc}\n${fence}`,
    '### Product features',
    `${fence}\n${feats}\n${fence}`,
    '### Notes for certification testers',
    `${fence}\nnotes\n${fence}`,
  ].join('\n');

describe('checkListing', () => {
  it('accepts the real listing.md', () => {
    expect(checkListing(real)).toEqual([]);
  });
  it('accepts a small valid document', () => {
    expect(checkListing(doc('hello'))).toEqual([]);
  });
  it('rejects a too-long description, URLs and HTML', () => {
    expect(checkListing(doc('x'.repeat(10001)))[0]).toMatch(/Description: 10001/);
    expect(checkListing(doc('see https://example.com'))).toContain('Description: contains a URL');
    expect(checkListing(doc('a <b>bold</b>'))).toContain('Description: contains HTML');
  });
  it('rejects more than 20 features, long features and bullets', () => {
    const many = Array.from({ length: 21 }, (_, i) => `f${i}`).join('\n');
    expect(checkListing(doc('d', many))).toContain('Product features: 21 items, limit 20');
    expect(checkListing(doc('d', 'y'.repeat(201)))[0]).toMatch(/feature 1: 201/);
    expect(checkListing(doc('d', '- bullet'))[0]).toMatch(/starts with a bullet/);
  });
  it('reports a missing section', () => {
    expect(checkListing('# nothing')).toContain('Short description: missing or empty');
  });
  it('block() returns the first fenced block under a heading', () => {
    expect(block(doc('hello'), 'Description (plain')).toBe('hello');
  });
});
