// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import { resolveShellBuild } from '../shell-build.js';

describe('resolveShellBuild', () => {
  it('reports the stamped build', () => {
    expect(
      resolveShellBuild({ stamped: '1.0.2.0.22', override: undefined, allowOverride: true }),
    ).toBe('1.0.2.0.22');
  });
  it('takes the override only when allowed (never in a packaged app)', () => {
    expect(resolveShellBuild({ stamped: '1.0.2.0.22', override: 'old', allowOverride: true })).toBe(
      'old',
    );
    expect(
      resolveShellBuild({ stamped: '1.0.2.0.22', override: 'old', allowOverride: false }),
    ).toBe('1.0.2.0.22');
  });
  it('says unknown when nothing was stamped in', () => {
    expect(
      resolveShellBuild({ stamped: undefined, override: undefined, allowOverride: false }),
    ).toBe('unknown');
    expect(resolveShellBuild({ stamped: '', override: undefined, allowOverride: false })).toBe(
      'unknown',
    );
  });
});
