// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import {
  FLUSH_RESERVE,
  RequestBudget,
  RUN_REQUEST_BUDGET,
  SUBREQUEST_LIMIT,
  WORST_CASE_REGISTRATION_COST,
} from '../budget.js';

describe('RequestBudget', () => {
  it('keeps headroom under the plan cap', () => {
    expect(RUN_REQUEST_BUDGET).toBeLessThan(SUBREQUEST_LIMIT);
  });

  it('counts down as requests are spent', () => {
    const budget = new RequestBudget(10);
    budget.spend();
    budget.spend(3);
    expect(budget.remaining).toBe(6);
  });

  it('allows a registration only while a worst-case one, plus the final flush, still fits', () => {
    const need = WORST_CASE_REGISTRATION_COST + FLUSH_RESERVE;
    const budget = new RequestBudget(need + 1);
    expect(budget.canStartRegistration()).toBe(true);
    budget.spend(1);
    expect(budget.canStartRegistration()).toBe(true);
    budget.spend(1);
    expect(budget.canStartRegistration()).toBe(false);
  });
});
