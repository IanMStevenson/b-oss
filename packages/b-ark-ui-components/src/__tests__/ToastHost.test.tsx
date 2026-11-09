// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { act, fireEvent, render } from '@testing-library/react';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTO_DISMISS_MS, ToastHost } from '../ToastHost.js';

describe('ToastHost timing (b-oss#985)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('auto-dismisses info after 30 s but never an error', () => {
    const onDismiss = vi.fn();
    render(
      <ToastHost
        toasts={[
          { id: 'i', level: 'info', message: 'hi' },
          { id: 'e', level: 'error', message: 'boom' },
        ]}
        onDismiss={onDismiss}
      />,
    );
    act(() => void vi.advanceTimersByTime(AUTO_DISMISS_MS + 1000));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledWith('i');
  });

  it('pauses while hovered and restarts a full timeout on leave', () => {
    const onDismiss = vi.fn();
    const { getByRole } = render(
      <ToastHost toasts={[{ id: 'w', level: 'warn', message: 'w' }]} onDismiss={onDismiss} />,
    );
    const card = getByRole('alert');
    fireEvent.mouseEnter(card);
    act(() => void vi.advanceTimersByTime(AUTO_DISMISS_MS * 3));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.mouseLeave(card);
    act(() => void vi.advanceTimersByTime(AUTO_DISMISS_MS + 1));
    expect(onDismiss).toHaveBeenCalledWith('w');
  });
});
