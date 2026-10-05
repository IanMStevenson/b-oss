// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, afterEach, vi } from 'vitest';
import { resumeGet, resumeSet, resumeClear } from '../resumeCache.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('resumeCache', () => {
  it('remembers a value per key', () => {
    resumeSet('a', { n: 1 });
    resumeSet('b', 2);
    expect(resumeGet('a')).toEqual({ n: 1 });
    expect(resumeGet('b')).toBe(2);
    expect(resumeGet('missing')).toBeUndefined();
  });

  it('forgets a value after ten minutes, so a stale feed is refetched, not shown', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
    resumeSet('feed', 'data');

    vi.setSystemTime(new Date('2026-10-05T12:09:59Z'));
    expect(resumeGet('feed')).toBe('data');

    vi.setSystemTime(new Date('2026-10-05T12:10:01Z'));
    expect(resumeGet('feed')).toBeUndefined();
  });

  it('a fresh write restarts the clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-05T12:00:00Z'));
    resumeSet('feed', 'v1');
    vi.setSystemTime(new Date('2026-10-05T12:09:00Z'));
    resumeSet('feed', 'v2');
    vi.setSystemTime(new Date('2026-10-05T12:15:00Z')); // 15 min after v1, 6 after v2
    expect(resumeGet('feed')).toBe('v2');
  });

  it('clears everything, or just one prefix (e.g. one account’s)', () => {
    resumeSet('browse:a1:feed', 1);
    resumeSet('browse:a2:feed', 2);
    resumeSet('tag:a1:x', 3);

    resumeClear('browse:a1:');
    expect(resumeGet('browse:a1:feed')).toBeUndefined();
    expect(resumeGet('browse:a2:feed')).toBe(2);
    expect(resumeGet('tag:a1:x')).toBe(3);

    resumeClear();
    expect(resumeGet('browse:a2:feed')).toBeUndefined();
    expect(resumeGet('tag:a1:x')).toBeUndefined();
  });
});
