// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { isOnline, openUrl } = vi.hoisted(() => ({ isOnline: vi.fn(), openUrl: vi.fn() }));
vi.mock('../../platform/connectivity.js', () => ({ isOnline }));
vi.mock('../../platform/browser.js', () => ({ openUrl }));

import { LoadFailed } from '../LoadFailed.js';

afterEach(cleanup);
beforeEach(() => {
  isOnline.mockReset();
  openUrl.mockReset();
});

describe('LoadFailed', () => {
  it('says the phone seems offline when a transport failure finds no connection', async () => {
    isOnline.mockResolvedValue(false);
    render(<LoadFailed transport onRefresh={() => {}} />);
    expect(screen.getByText('Checking your connection…')).toBeDefined();
    expect(await screen.findByText('You seem to be offline')).toBeDefined();
    expect(screen.getByText('Swipe down or tap below to try again.')).toBeDefined();
  });

  it('says Blipfoto is unreachable when a transport failure finds a connection', async () => {
    isOnline.mockResolvedValue(true);
    render(<LoadFailed transport onRefresh={() => {}} />);
    expect(await screen.findByText('Can’t reach Blipfoto')).toBeDefined();
    expect(screen.getByText('Swipe down or tap below to try again.')).toBeDefined();
  });

  it('shows the error’s own message, without probing, for a non-transport failure', () => {
    render(<LoadFailed transport={false} message="Entry not found" onRefresh={() => {}} />);
    expect(screen.getByText('Entry not found')).toBeDefined();
    expect(screen.getByText('Swipe down or tap below to try again.')).toBeDefined();
    expect(isOnline).not.toHaveBeenCalled();
  });

  it('keeps a Try again button for anyone who can’t swipe', async () => {
    isOnline.mockResolvedValue(true);
    const onRefresh = vi.fn();
    render(<LoadFailed transport onRefresh={onRefresh} />);
    await userEvent.click(screen.getByText('Try again'));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('links to the unofficial status page only when Blipfoto itself isn’t answering', async () => {
    isOnline.mockResolvedValue(true);
    const { unmount } = render(<LoadFailed transport onRefresh={() => {}} />);
    await userEvent.click(
      await screen.findByText('Is Blipfoto down? Check the unofficial status page'),
    );
    expect(openUrl).toHaveBeenCalledWith('https://b-oss.dev/b-status');
    unmount();

    isOnline.mockResolvedValue(false);
    render(<LoadFailed transport onRefresh={() => {}} />);
    await screen.findByText('You seem to be offline');
    expect(screen.queryByText('Is Blipfoto down? Check the unofficial status page')).toBeNull();
    cleanup();

    render(<LoadFailed transport={false} message="Entry not found" onRefresh={() => {}} />);
    expect(screen.queryByText('Is Blipfoto down? Check the unofficial status page')).toBeNull();
  });
});
