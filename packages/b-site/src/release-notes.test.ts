import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { longDate, parseReleaseNotes } from './release-notes';

const parse = (name: string) =>
  parseReleaseNotes(readFileSync(new URL(`./release-notes-fixtures/${name}.md`, import.meta.url), 'utf8'), name);

describe('parseReleaseNotes', () => {
  it('reads releases in file order, joining lines and keeping paragraphs', () => {
    expect(parse('valid')).toEqual([
      { version: '1.2.0', date: '2026-11-05', paragraphs: ['A short note for this release.'] },
      {
        version: '1.1.0',
        date: '2026-10-01',
        paragraphs: ['A note that wraps onto a second line.', 'And a second paragraph.'],
      },
    ]);
  });

  it('accepts a note of exactly 500 characters', () => {
    expect(parse('at-limit')).toHaveLength(1);
  });

  it('gives no releases for an empty file', () => {
    expect(parseReleaseNotes('\n', 'empty')).toEqual([]);
  });

  it.each([
    ['over-limit', '501 characters'],
    ['bad-heading', 'malformed heading'],
    ['bad-date', 'not a real date'],
    ['no-note', 'has no note'],
    ['before-heading', 'text before the first heading'],
    ['out-of-order', 'out of order'],
  ])('fails on %s, naming the file', (name, problem) => {
    expect(() => parse(name)).toThrow(`${name}: `);
    expect(() => parse(name)).toThrow(problem);
  });
});

describe('longDate', () => {
  it('writes the date out', () => {
    expect(longDate('2026-11-05')).toBe('5 November 2026');
  });
});
