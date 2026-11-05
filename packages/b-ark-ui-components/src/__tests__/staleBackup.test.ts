// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { describeStaleBackup } from '../staleBackup.js';

describe('describeStaleBackup', () => {
  it("is retrospective and offers Dismiss and Don't show again", () => {
    const r = describeStaleBackup({ lastBackupAt: '2026-11-03T02:00:00Z', daysSince: 9 }, 'en-GB');
    expect(r.text).toContain('had not run for 9 days');
    expect(r.text).toContain('3 Nov');
    expect(r.text).toContain('If your computer was off, that is expected');
    expect(r.actions).toEqual(['dismiss', 'dont_show_again']);
  });
});
