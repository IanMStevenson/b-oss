// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BrowsingSection } from '../sections/BrowsingSection.js';
import { useDevicePrefsStore } from '../../../state/devicePrefsStore.js';

vi.mock('../../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  useDevicePrefsStore.setState({
    showZoomBar: true,
    showPagination: true,
    thumbnailMargins: 'normal',
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('BrowsingSection', () => {
  it('shows both toggles on, and Normal selected, by default', () => {
    render(<BrowsingSection />);
    const zoomToggle = screen.getByText('Show zoom bar').closest('ion-checkbox')!;
    const paginationToggle = screen.getByText('Show pagination').closest('ion-checkbox')!;
    expect(zoomToggle.getAttribute('checked')).not.toBe('false');
    expect(paginationToggle.getAttribute('checked')).not.toBe('false');
    // IonLabel doesn't reliably render its children in this jsdom setup (SettingsScreen.tsx's own
    // header comment documents the same gotcha) — assert via the segment's own value instead.
    expect(document.querySelector('ion-segment')!.getAttribute('value')).toBe('normal');
  });

  it('toggling the zoom bar checkbox persists immediately', () => {
    render(<BrowsingSection />);
    const toggle = screen.getByText('Show zoom bar').closest('ion-checkbox')!;
    toggle.dispatchEvent(
      new CustomEvent('ionChange', { bubbles: true, detail: { checked: false } }),
    );
    expect(useDevicePrefsStore.getState().showZoomBar).toBe(false);
  });

  it('toggling the pagination checkbox persists immediately', () => {
    render(<BrowsingSection />);
    const toggle = screen.getByText('Show pagination').closest('ion-checkbox')!;
    toggle.dispatchEvent(
      new CustomEvent('ionChange', { bubbles: true, detail: { checked: false } }),
    );
    expect(useDevicePrefsStore.getState().showPagination).toBe(false);
  });

  it('changing the margins segment persists the new value', () => {
    render(<BrowsingSection />);
    const segment = document.querySelector('ion-segment')!;
    segment.dispatchEvent(
      new CustomEvent('ionChange', { bubbles: true, detail: { value: 'narrow' } }),
    );
    expect(useDevicePrefsStore.getState().thumbnailMargins).toBe('narrow');
  });
});
