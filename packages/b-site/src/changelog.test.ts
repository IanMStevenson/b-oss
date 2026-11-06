import { describe, expect, it } from 'vitest';
import { entryHtml, longDate, releasesFor } from './changelog';

const SAMPLE = `# Changelog

## [Unreleased]

### Added

- b-ark: not out yet.

## [b-mobile 1.3.0] - 2026-11-05

### Added

- b-mobile: a bar to step through
  the grid.
- b-push: a service change.

## [1.0.7] - 2026-11-03

### Changed

- b-ark, b-ark-chrome: a shared change.
- b-ark and b-ark-chrome: another shared one.
- b-ark-chrome: chrome only.
- internal: b-ark updated to Electron 45.
- Untagged line.

## [1.0.6] - 2026-10-23

- backup-engine: nothing for anyone.
`;

describe('releasesFor', () => {
  it('keeps only entries tagged for the product, without the tag', () => {
    expect(releasesFor(SAMPLE, 'b-ark')).toEqual([
      { version: '1.0.7', date: '2026-11-03', entries: ['A shared change.', 'Another shared one.'] },
    ]);
  });

  it('does not confuse b-ark-chrome with b-ark', () => {
    expect(releasesFor(SAMPLE, 'b-ark-chrome')[0].entries).toEqual([
      'A shared change.',
      'Another shared one.',
      'Chrome only.',
    ]);
  });

  it('joins wrapped lines and reads b-mobile headings', () => {
    expect(releasesFor(SAMPLE, 'b-mobile')).toEqual([
      { version: '1.3.0', date: '2026-11-05', entries: ['A bar to step through the grid.'] },
    ]);
  });

  it('gives a product with no tagged entries nothing', () => {
    expect(releasesFor(SAMPLE, 'b-mobile-pc')).toEqual([]);
  });
});

describe('entryHtml', () => {
  it('renders bold and code, and escapes the rest', () => {
    expect(entryHtml('**A** `b` <c> & d')).toBe('<strong>A</strong> <code>b</code> &lt;c> &amp; d');
  });
});

describe('longDate', () => {
  it('writes the date out', () => {
    expect(longDate('2026-11-05')).toBe('5 November 2026');
  });
});
