// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { completedStatus, withOutstanding } from '../rag-reasons.js';

const counts = { retrying: 1, unavailable: 2, other: 0 };

describe('completedStatus', () => {
  it('is green with no reasons when nothing is outstanding and the website session is fine', () => {
    expect(completedStatus({ scrapeDegraded: false, outstanding: null })).toEqual({
      rag_state: 'green',
      rag_reasons: [],
    });
  });

  it('is amber with each cause as its own reason', () => {
    expect(completedStatus({ scrapeDegraded: true, outstanding: counts })).toEqual({
      rag_state: 'amber',
      rag_reasons: [{ code: 'web_signin_missing' }, { code: 'outstanding', ...counts }],
    });
  });
});

describe('withOutstanding', () => {
  it('replaces the outstanding reason and keeps the others', () => {
    const next = withOutstanding(
      {
        rag_state: 'amber',
        rag_reasons: [{ code: 'web_signin_missing' }, { code: 'outstanding', ...counts }],
      },
      null,
    );
    expect(next).toEqual({ rag_state: 'amber', rag_reasons: [{ code: 'web_signin_missing' }] });
  });

  it('goes green once the last reason is gone', () => {
    expect(
      withOutstanding(
        { rag_state: 'amber', rag_reasons: [{ code: 'outstanding', ...counts }] },
        null,
      ),
    ).toEqual({ rag_state: 'green', rag_reasons: [] });
  });

  it('never lowers red', () => {
    expect(withOutstanding({ rag_state: 'red', rag_reasons: [] }, null).rag_state).toBe('red');
  });
});
