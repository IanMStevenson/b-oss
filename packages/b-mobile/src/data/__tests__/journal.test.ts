// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { toDayEligibility } from '../journal.js';
import type { BlipDay } from '@b-oss/b-api';

function day(state: BlipDay['state'], entryId: string | null = null): BlipDay {
  return {
    day: 1,
    month: 1,
    year: 2026,
    state,
    entry: entryId ? ({ entry_id_str: entryId } as BlipDay['entry']) : null,
    actions: { publish: state === 0 ? 1 : 0 },
  };
}

describe('toDayEligibility', () => {
  it('state 0 (free) is publishable with no message', () => {
    expect(toDayEligibility(day(0))).toEqual({
      publishable: true,
      message: null,
      existingEntryId: null,
    });
  });

  it('state 1 (already an entry) blocks and offers the jump affordance', () => {
    expect(toDayEligibility(day(1, 'e1'))).toEqual({
      publishable: false,
      message: 'You already have an entry for that day.',
      existingEntryId: 'e1',
    });
  });

  it('state 1 with no entry stub still blocks, with no jump affordance', () => {
    expect(toDayEligibility(day(1))).toEqual({
      publishable: false,
      message: 'You already have an entry for that day.',
      existingEntryId: null,
    });
  });

  it('state 2 (suspended) uses the identical message to state 1, but never offers the jump affordance', () => {
    expect(toDayEligibility(day(2, 'e1'))).toEqual({
      publishable: false,
      message: 'You already have an entry for that day.',
      existingEntryId: null,
    });
  });

  it('state 3 (future) has its own message', () => {
    expect(toDayEligibility(day(3)).message).toBe('That date is in the future.');
  });

  it('state 4 (too old) has its own message', () => {
    expect(toDayEligibility(day(4)).message).toBe('That date is too far in the past.');
  });

  it('state 5 (blocked) gets a neutral message, not an invented reason', () => {
    expect(toDayEligibility(day(5)).message).toBe("You can't publish an entry for that date.");
  });

  it('every non-zero state blocks publishing', () => {
    for (const state of [1, 2, 3, 4, 5] as const) {
      expect(toDayEligibility(day(state)).publishable).toBe(false);
    }
  });
});
