// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import { describeStartupTask, type StartupTaskState } from '../startupTask.js';

const w = (state: StartupTaskState, wanted = true) => describeStartupTask({ state }, wanted);

describe('describeStartupTask', () => {
  it('is silent when not a Store build (null info)', () => {
    expect(describeStartupTask(null, true)).toBeNull();
  });
  it('is silent when the user does not want start with Windows', () => {
    for (const s of ['disabled', 'disabled-by-user', 'disabled-by-policy', 'unknown'] as const) {
      expect(w(s, false)).toBeNull();
    }
  });
  it('is silent when enabled', () => {
    expect(w('enabled')).toBeNull();
    expect(w('enabled-by-policy')).toBeNull();
  });
  it('offers to enable a plain disabled task', () => {
    expect(w('disabled')?.action).toBe('enable');
  });
  it('sends blocked and unknown states to Windows Settings with instructions', () => {
    for (const s of ['disabled-by-user', 'disabled-by-policy', 'unknown'] as const) {
      const warning = w(s);
      expect(warning?.action).toBe('open_settings');
      expect(warning?.text).toContain('Apps → Startup');
    }
    expect(w('disabled-by-user')?.text).toContain('cannot switch itself back on');
  });
});
