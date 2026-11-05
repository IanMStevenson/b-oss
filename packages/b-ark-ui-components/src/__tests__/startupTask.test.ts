// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import { describeStartupTask, type StartupTaskState } from '../startupTask.js';

const settings = { path: 'Somewhere → Apps → Startup', openLabel: 'Open the startup settings' };
const w = (state: StartupTaskState, wanted = true) =>
  describeStartupTask({ state, settings }, wanted);

describe('describeStartupTask', () => {
  it('is silent when this build does not report a state (null info)', () => {
    expect(describeStartupTask(null, true)).toBeNull();
  });
  it('is silent when the user does not want start at sign-in', () => {
    for (const s of ['off', 'needs-user-action', 'blocked-by-policy', 'unknown'] as const) {
      expect(w(s, false)).toBeNull();
    }
  });
  it('is silent when on', () => {
    expect(w('on')).toBeNull();
  });
  it('offers to enable when off', () => {
    expect(w('off')?.action).toBe('enable');
  });
  it('sends the other states to the platform settings, using the platform wording', () => {
    for (const s of ['needs-user-action', 'blocked-by-policy', 'unknown'] as const) {
      const warning = w(s);
      expect(warning?.action).toBe('open_settings');
      expect(warning?.actionLabel).toBe(settings.openLabel);
      expect(warning?.text).toContain(settings.path);
    }
    expect(w('needs-user-action')?.text).toContain('cannot switch itself back on');
  });
  it('names no platform itself', () => {
    for (const s of ['off', 'needs-user-action', 'blocked-by-policy', 'unknown'] as const) {
      const warning = w(s);
      expect(`${warning?.headline} ${warning?.text}`).not.toMatch(/windows|mac/i);
    }
  });
});
