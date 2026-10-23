// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import { deriveStates } from '../derive.js';
import type { CheckId, CheckResult, CheckStatus } from '../types.js';

const r = (id: CheckId, status: CheckStatus): CheckResult => ({ id, status, ms: 1 });
const all = (s: Record<CheckId, CheckStatus>): CheckResult[] =>
  (Object.keys(s) as CheckId[]).map((id) => r(id, s[id]));
const ok: Record<CheckId, CheckStatus> = {
  website_browse: 'pass',
  website_entry: 'pass',
  photo: 'pass',
  api_recent: 'pass',
  api_entry: 'pass',
};

describe('deriveStates', () => {
  it('everything passing is up for both', () => {
    const s = deriveStates(all(ok));
    expect(s.site.state).toBe('up');
    expect(s.api.state).toBe('up');
  });

  it('a photo failure takes BOTH components down and names the check', () => {
    const s = deriveStates(all({ ...ok, photo: 'fail' }));
    expect(s.site).toEqual({ state: 'down', failed: ['photo'] });
    expect(s.api).toEqual({ state: 'down', failed: ['photo'] });
  });

  it('a website failure leaves the API up', () => {
    const s = deriveStates(
      all({ ...ok, website_browse: 'fail', website_entry: 'skipped', photo: 'skipped' }),
    );
    expect(s.site).toEqual({ state: 'down', failed: ['website_browse'] });
    expect(s.api.state).toBe('up');
  });

  it('skipped checks are not failures (one root cause is counted once)', () => {
    const s = deriveStates(all({ ...ok, api_recent: 'fail', api_entry: 'skipped' }));
    expect(s.api).toEqual({ state: 'down', failed: ['api_recent'] });
    expect(s.site.state).toBe('up');
  });

  it('is Unknown when none of a component’s own checks ran, even if photo passed', () => {
    const s = deriveStates(all({ ...ok, api_recent: 'skipped', api_entry: 'skipped' }));
    expect(s.api).toEqual({ state: 'unknown', failed: [] });
    expect(s.site.state).toBe('up');
  });
});
