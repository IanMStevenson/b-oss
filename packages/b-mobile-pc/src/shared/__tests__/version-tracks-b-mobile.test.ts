// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// b-mobile-pc's version is the Store/MSIX version; the app itself shows b-mobile's version in Help &
// info. Keeping the first two digits equal means the Store and the app agree, and that desktop and
// Android releases line up (b-oss#612). Bump both package.json files together at a release.
const version = (pkg: string): string =>
  (
    JSON.parse(readFileSync(resolve(__dirname, `../../../../${pkg}/package.json`), 'utf8')) as {
      version: string;
    }
  ).version;
const firstTwo = (v: string): string => v.split('.').slice(0, 2).join('.');

describe('b-mobile-pc version', () => {
  it('has the same major.minor as b-mobile for Android', () => {
    expect(firstTwo(version('b-mobile-pc'))).toBe(firstTwo(version('b-mobile')));
  });
});
