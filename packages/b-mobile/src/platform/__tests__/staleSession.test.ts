// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// b-oss#678: reload once on a failed chunk load, never loop, desktop only.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GUARD_WINDOW_MS,
  chunkNameOf,
  claimReload,
  isChunkLoadError,
  recoverFromStaleChunk,
} from '../staleSession.js';

const err = new TypeError(
  'Failed to fetch dynamically imported module: app://b-mobile/assets/ComposeEntryScreen-BmhCE0tI.js',
);

function store() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
}

describe('claimReload', () => {
  it('allows the first failure, refuses a second inside the window, allows again after it', () => {
    const s = store();
    expect(claimReload(s, 1_000_000)).toBe(true);
    expect(claimReload(s, 1_000_000 + GUARD_WINDOW_MS - 1)).toBe(false);
    expect(claimReload(s, 1_000_000 + GUARD_WINDOW_MS)).toBe(true);
  });
});

describe('isChunkLoadError / chunkNameOf', () => {
  it('recognises a failed dynamic import and names the chunk', () => {
    expect(isChunkLoadError(err)).toBe(true);
    expect(chunkNameOf(err)).toBe('ComposeEntryScreen-BmhCE0tI.js');
  });
  it('ignores other errors', () => {
    expect(isChunkLoadError(new Error('boom'))).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe('recoverFromStaleChunk', () => {
  const reload = vi.fn();
  afterEach(() => {
    vi.unstubAllGlobals();
    reload.mockReset();
  });

  function setup(desktop: boolean) {
    const win: Record<string, unknown> = {
      sessionStorage: store(),
      location: { reload },
    };
    if (desktop) win.bMobileDesktop = { version: 1 };
    vi.stubGlobal('window', win);
  }

  it('reloads once on desktop, then shows the error screen on a repeat', () => {
    setup(true);
    expect(recoverFromStaleChunk(err)).toBe(true);
    expect(recoverFromStaleChunk(err)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('never reloads off desktop (Android, web)', () => {
    setup(false);
    expect(recoverFromStaleChunk(err)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not reload for an unrelated error', () => {
    setup(true);
    expect(recoverFromStaleChunk(new Error('boom'))).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
