// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { completedStatus, effectiveStatus, withOutstanding } from '../rag-reasons.js';

const counts = { retrying: 1, unavailable: 2, other: 0 };

describe('completedStatus', () => {
  it('is green with no reasons when nothing is outstanding', () => {
    expect(completedStatus({ outstanding: null })).toEqual({
      rag_state: 'green',
      rag_reasons: [],
    });
  });

  it('is amber with the outstanding reason', () => {
    expect(completedStatus({ outstanding: counts })).toEqual({
      rag_state: 'amber',
      rag_reasons: [{ code: 'outstanding', ...counts }],
    });
  });
});

describe('withOutstanding', () => {
  it('replaces the outstanding reason and keeps the other stored ones', () => {
    const next = withOutstanding(
      {
        rag_state: 'amber',
        rag_reasons: [{ code: 'incomplete' }, { code: 'outstanding', ...counts }],
      },
      null,
    );
    expect(next).toEqual({ rag_state: 'amber', rag_reasons: [{ code: 'incomplete' }] });
  });

  it('goes green once the last reason is gone', () => {
    expect(
      withOutstanding(
        { rag_state: 'amber', rag_reasons: [{ code: 'outstanding', ...counts }] },
        null,
      ),
    ).toEqual({ rag_state: 'green', rag_reasons: [] });
  });

  it('never persists the website-session reason', () => {
    const next = withOutstanding(
      { rag_state: 'amber', rag_reasons: [{ code: 'web_signin_missing' }] },
      null,
    );
    expect(next).toEqual({ rag_state: 'green', rag_reasons: [] });
  });

  it('never lowers red', () => {
    expect(withOutstanding({ rag_state: 'red', rag_reasons: [] }, null).rag_state).toBe('red');
  });
});

describe('effectiveStatus', () => {
  it('turns a green journal amber while the website session is missing', () => {
    expect(effectiveStatus({ rag_state: 'green', rag_reasons: [] }, true)).toEqual({
      rag_state: 'amber',
      rag_reasons: [{ code: 'web_signin_missing' }],
    });
  });

  it('puts the website-session reason first and keeps the stored ones', () => {
    expect(
      effectiveStatus(
        { rag_state: 'amber', rag_reasons: [{ code: 'outstanding', ...counts }] },
        true,
      ).rag_reasons,
    ).toEqual([{ code: 'web_signin_missing' }, { code: 'outstanding', ...counts }]);
  });

  it('replaces old message-only amber status with the live reason, so Sign in is offered', () => {
    expect(effectiveStatus({ rag_state: 'amber' }, true)).toEqual({
      rag_state: 'amber',
      rag_reasons: [{ code: 'web_signin_missing' }],
    });
  });

  it('is unchanged when the session is fine and nothing stale is stored', () => {
    expect(effectiveStatus({ rag_state: 'green', rag_reasons: [] }, false)).toEqual({
      rag_state: 'green',
      rag_reasons: [],
    });
    expect(effectiveStatus({ rag_state: 'amber' }, false)).toEqual({
      rag_state: 'amber',
      rag_reasons: undefined,
    });
  });

  it('clears a stored website-session reason once the account is signed in', () => {
    expect(
      effectiveStatus({ rag_state: 'amber', rag_reasons: [{ code: 'web_signin_missing' }] }, false),
    ).toEqual({ rag_state: 'green', rag_reasons: [] });
    expect(
      effectiveStatus(
        {
          rag_state: 'amber',
          rag_reasons: [{ code: 'web_signin_missing' }, { code: 'outstanding', ...counts }],
        },
        false,
      ),
    ).toEqual({ rag_state: 'amber', rag_reasons: [{ code: 'outstanding', ...counts }] });
  });

  it('never changes red', () => {
    expect(effectiveStatus({ rag_state: 'red', rag_reasons: [] }, true)).toEqual({
      rag_state: 'red',
      rag_reasons: [],
    });
  });
});
