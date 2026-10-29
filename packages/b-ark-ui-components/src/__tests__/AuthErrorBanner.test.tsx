// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AuthErrorBanner } from '../AuthErrorBanner.js';

afterEach(cleanup);

const base = { errorMessage: 'Network error', highlighted: false };

describe('AuthErrorBanner', () => {
  it('keeps Reauthorise for non-network failures', () => {
    const onReauthorise = vi.fn();
    render(<AuthErrorBanner {...base} onReauthorise={onReauthorise} onRetry={() => {}} />);
    fireEvent.click(screen.getByText('Reauthorise'));
    expect(onReauthorise).toHaveBeenCalledOnce();
    expect(screen.queryByText('Retry')).toBeNull();
  });

  it('offers Retry and Check Blipfoto Status when Blipfoto is not answering', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const onRetry = vi.fn();
    render(
      <AuthErrorBanner
        {...base}
        networkFailure="blipfoto"
        onRetry={onRetry}
        onReauthorise={() => {}}
      />,
    );
    expect(screen.queryByText('Reauthorise')).toBeNull();
    fireEvent.click(screen.getByText('Retry'));
    expect(onRetry).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText('Check Blipfoto Status'));
    expect(open).toHaveBeenCalledWith(
      'https://b-oss.dev/b-status',
      '_blank',
      'noopener,noreferrer',
    );
    open.mockRestore();
  });

  it('offers only Retry when the machine itself is offline', () => {
    render(
      <AuthErrorBanner
        {...base}
        networkFailure="offline"
        onRetry={() => {}}
        onReauthorise={() => {}}
      />,
    );
    expect(screen.getByText('Retry')).toBeDefined();
    expect(screen.queryByText('Check Blipfoto Status')).toBeNull();
    expect(screen.queryByText('Reauthorise')).toBeNull();
  });
});
