// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// b-oss#719: a header refresh button on mouse/trackpad devices; touch keeps pull-to-refresh only.

import { createElement } from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PointerRefresh } from '../PointerRefresh.js';

function setPointer(fine: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: fine && query === '(pointer: fine)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

function renderInPage(onRefresh: () => void) {
  // jsdom has no <ion-page> in the JSX typings; the component only needs the tag name.
  return render(
    createElement(
      'ion-page',
      null,
      <div className="app-header-refresh-slot" />,
      <PointerRefresh onRefresh={onRefresh} />,
    ),
  );
}

afterEach(cleanup);

describe('PointerRefresh', () => {
  it('shows a Refresh button in the header slot on a fine pointer and calls the handler', async () => {
    setPointer(true);
    const onRefresh = vi.fn();
    renderInPage(onRefresh);
    await userEvent.click(screen.getByLabelText('Refresh'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders nothing on a coarse (touch) pointer', () => {
    setPointer(false);
    renderInPage(vi.fn());
    expect(screen.queryByLabelText('Refresh')).toBeNull();
  });
});
