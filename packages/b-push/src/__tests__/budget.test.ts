// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import {
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

  it('allows a registration only while a worst-case one still fits, with the pending flush', () => {
    const need = WORST_CASE_REGISTRATION_COST + 1; // nothing pending: just the row's own possible write
    const budget = new RequestBudget(need + 1);
    expect(budget.canStartRegistration(0)).toBe(true);
    budget.spend(1);
    expect(budget.canStartRegistration(0)).toBe(true);
    budget.spend(1);
    expect(budget.canStartRegistration(0)).toBe(false);
  });

  it('reserves one query per queued quiet poll', () => {
    const budget = new RequestBudget(WORST_CASE_REGISTRATION_COST + 4);
    expect(budget.canStartRegistration(3)).toBe(true);
    expect(budget.canStartRegistration(4)).toBe(false);
  });
});
