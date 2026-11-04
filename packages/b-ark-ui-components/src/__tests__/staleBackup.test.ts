// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { describeStaleBackup } from '../staleBackup.js';

const base = { lastBackupAt: '2026-11-03T02:00:00Z', daysSince: 9 };

describe('describeStaleBackup', () => {
  it('is retrospective and offers Startup settings + Dismiss on Windows', () => {
    const r = describeStaleBackup({ ...base, platform: 'win32' }, 'en-GB');
    expect(r.text).toContain('had not backed up for 9 days');
    expect(r.text).toContain('3 Nov');
    expect(r.text).toContain('If your computer was off, that is expected');
    expect(r.actions).toEqual(['open_startup_settings', 'dismiss']);
  });

  it('is specific when start-with-Windows is known to be off', () => {
    const r = describeStaleBackup({ ...base, platform: 'win32', startupEnabled: false }, 'en-GB');
    expect(r.text).toContain('not set to start with Windows');
  });

  it('offers no Windows guidance elsewhere', () => {
    const r = describeStaleBackup({ ...base, platform: 'linux' }, 'en-GB');
    expect(r.text).not.toContain('Startup');
    expect(r.actions).toEqual(['dismiss']);
  });
});
