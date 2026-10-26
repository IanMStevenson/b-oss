// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import { appVersion } from './appVersion.js';

describe('appVersion', () => {
  it('shows the bare b-mobile version on a release build, whatever the root version is', () => {
    expect(appVersion('1.0.1', { version: '1.0.5', isRelease: true })).toBe('1.0.1');
  });

  it('keeps the dev suffix but uses the b-mobile base', () => {
    expect(appVersion('1.0.1', { version: '1.0.6.812.4', isRelease: false })).toBe('1.0.1.812.4');
  });

  it('marks a build with no stamp as dev', () => {
    expect(appVersion('1.0.1', null)).toBe('1.0.1-dev');
  });
});
