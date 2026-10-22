// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AmberBanner } from '../AmberBanner.js';
import { describeReasons } from '../ragReasons.js';

afterEach(cleanup);

describe('describeReasons', () => {
  it('is empty unless the journal is amber', () => {
    expect(
      describeReasons({
        rag_state: 'green',
        error_message: null,
        rag_reasons: [{ code: 'incomplete' }],
      }),
    ).toEqual([]);
    expect(
      describeReasons({ rag_state: 'red', error_message: 'Token expired', rag_reasons: [] }),
    ).toEqual([]);
  });

  it('words each outstanding state by cause, and offers Retry/Dismiss only past the window', () => {
    const [inWindow] = describeReasons({
      rag_state: 'amber',
      error_message: null,
      rag_reasons: [{ code: 'outstanding', retrying: 1, unavailable: 0, other: 0 }],
    });
    expect(inWindow.text).toBe('1 entry not archived yet — will retry');
    expect(inWindow.actions).toEqual([]);

    const [pastWindow] = describeReasons({
      rag_state: 'amber',
      error_message: null,
      rag_reasons: [{ code: 'outstanding', retrying: 0, unavailable: 2, other: 1 }],
    });
    expect(pastWindow.text).toBe(
      '2 entries are suspended or unavailable on Blipfoto. 1 entry could not be fetched after 14 days of trying',
    );
    expect(pastWindow.actions).toEqual(['retry', 'dismiss']);
  });

  it('offers Sign in for a missing website session', () => {
    const [r] = describeReasons({
      rag_state: 'amber',
      error_message: null,
      rag_reasons: [{ code: 'web_signin_missing' }],
    });
    expect(r.actions).toEqual(['sign_in']);
  });

  it('falls back to the old error_message for amber status written before reasons existed', () => {
    const [r] = describeReasons({ rag_state: 'amber', error_message: 'Network down' });
    expect(r.text).toBe('Network down');
  });

  it('is empty for amber with neither reasons nor a message (a run in progress)', () => {
    expect(describeReasons({ rag_state: 'amber', error_message: null })).toEqual([]);
  });
});

describe('AmberBanner', () => {
  it('lists every reason and reports the action clicked', () => {
    const onAction = vi.fn();
    render(
      <AmberBanner
        reasons={[
          { key: 'incomplete', text: "The last backup didn't finish.", actions: [] },
          { key: 'outstanding', text: '2 entries are suspended', actions: ['retry', 'dismiss'] },
        ]}
        onAction={onAction}
      />,
    );
    expect(screen.getByText("The last backup didn't finish.")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onAction.mock.calls).toEqual([['dismiss'], ['retry']]);
  });

  it('renders nothing without reasons', () => {
    const { container } = render(<AmberBanner reasons={[]} onAction={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
