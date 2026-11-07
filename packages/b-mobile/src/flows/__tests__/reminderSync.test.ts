// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import { enabledReminders } from '../reminderSync.js';

describe('enabledReminders', () => {
  it('lists only reminders that are on, in a stable order', () => {
    expect(
      enabledReminders({
        b: { enabled: true, hour: 20, minute: 0 },
        a: { enabled: true, hour: 8, minute: 15 },
        c: { enabled: false, hour: 9, minute: 0 },
      }),
    ).toEqual([
      { accountId: 'a', hour: 8, minute: 15 },
      { accountId: 'b', hour: 20, minute: 0 },
    ]);
  });
});
