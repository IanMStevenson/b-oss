// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it, vi } from 'vitest';
import { createQuitSequence, QUIT_GRACE_MS } from '../quit-sequence.js';

function setup(disposers: Array<() => void>) {
  let fire: (() => void) | null = null;
  let delay = 0;
  const unref = vi.fn();
  const forceExit = vi.fn();
  const quit = createQuitSequence({
    disposers,
    forceExit,
    log: () => undefined,
    setTimer: (fn, ms) => {
      fire = fn;
      delay = ms;
      return { unref };
    },
  });
  return { quit, forceExit, unref, fire: () => fire?.(), delay: () => delay };
}

describe('createQuitSequence', () => {
  it('runs every disposer, even when one throws', () => {
    const a = vi.fn(() => {
      throw new Error('boom');
    });
    const b = vi.fn();
    setup([a, b]).quit();
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('forces exit only if the process is still alive after the grace period', () => {
    const s = setup([]);
    s.quit();
    expect(s.forceExit).not.toHaveBeenCalled();
    expect(s.delay()).toBe(QUIT_GRACE_MS);
    s.fire();
    expect(s.forceExit).toHaveBeenCalledOnce();
  });

  it('does not let its own timer keep the process alive', () => {
    const s = setup([]);
    s.quit();
    expect(s.unref).toHaveBeenCalledOnce();
  });

  it('is idempotent across before-quit firing twice', () => {
    const d = vi.fn();
    const s = setup([d]);
    s.quit();
    s.quit();
    expect(d).toHaveBeenCalledOnce();
  });
});
