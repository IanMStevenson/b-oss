// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { AppErrorBoundary } from '../AppErrorBoundary.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function Boom(): never {
  throw new Error('boom');
}

describe('AppErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(
      <AppErrorBoundary>
        <p>fine</p>
      </AppErrorBoundary>,
    );
    expect(screen.getByText('fine')).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the fallback when a child throws during render, and Reload reloads the page', () => {
    // React reports caught render errors to console.error; keep the test output clean.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });

    render(
      <AppErrorBoundary>
        <Boom />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('Something went wrong')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalledOnce();
  });
});

describe('AppErrorBoundary on the desktop shell (b-oss#639)', () => {
  function stubBridge() {
    const diagnostics = {
      logError: vi.fn().mockResolvedValue(undefined),
      openLogFolder: vi.fn().mockResolvedValue(undefined),
      copyText: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal('bMobileDesktop', { version: 1, diagnostics });
    return diagnostics;
  }

  function Leaky(): never {
    throw new Error('lookup failed: access_token=SECRETVALUE9');
  }

  it('logs the error, shows the message, copies redacted details and opens the log folder', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const diagnostics = stubBridge();
    render(
      <AppErrorBoundary>
        <Leaky />
      </AppErrorBoundary>,
    );

    expect(diagnostics.logError).toHaveBeenCalledOnce();
    const logged = JSON.stringify(diagnostics.logError.mock.calls);
    expect(logged).toContain('lookup failed');
    expect(logged).not.toContain('SECRETVALUE9');
    expect(screen.getByText(/lookup failed/)).toBeDefined();
    expect(screen.queryByText(/SECRETVALUE9/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Copy details' }));
    await vi.waitFor(() => expect(diagnostics.copyText).toHaveBeenCalledOnce());
    const copied = String(diagnostics.copyText.mock.calls[0]?.[0]);
    expect(copied).toContain('lookup failed');
    expect(copied).not.toContain('SECRETVALUE9');

    fireEvent.click(screen.getByRole('button', { name: 'Open log folder' }));
    expect(diagnostics.openLogFolder).toHaveBeenCalledOnce();
  });

  it('shows none of this off the desktop shell: Reload only, no message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <AppErrorBoundary>
        <Leaky />
      </AppErrorBoundary>,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByText(/lookup failed/)).toBeNull();
  });
});
