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
    photoFit: 'full-width',
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('BrowsingSection', () => {
  it('shows both toggles on, and Normal selected, by default', () => {
    render(<BrowsingSection />);
    const zoomToggle = screen.getByLabelText('Show zoom/navigation bar');
    const paginationToggle = screen.getByLabelText('Show pagination');
    expect(zoomToggle.getAttribute('checked')).not.toBe('false');
    expect(paginationToggle.getAttribute('checked')).not.toBe('false');
    // IonLabel doesn't reliably render its children in this jsdom setup (SettingsScreen.tsx's own
    // header comment documents the same gotcha) — assert via the segment's own value instead.
    expect(document.querySelector('ion-segment')!.value).toBe('normal');
  });

  it('says changes apply immediately, with no Save button', () => {
    render(<BrowsingSection />);
    expect(screen.getByText('Changes apply immediately.')).toBeDefined();
    expect(screen.queryByText('Save')).toBeNull();
  });

  it('toggling the zoom bar toggle persists immediately', () => {
    render(<BrowsingSection />);
    const toggle = screen.getByLabelText('Show zoom/navigation bar');
    toggle.dispatchEvent(
      new CustomEvent('ionChange', { bubbles: true, detail: { checked: false } }),
    );
    expect(useDevicePrefsStore.getState().showZoomBar).toBe(false);
  });

  it('toggling the pagination toggle persists immediately', () => {
    render(<BrowsingSection />);
    const toggle = screen.getByLabelText('Show pagination');
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

  it('photo size defaults to full width and persists Fit to screen', () => {
    render(<BrowsingSection />);
    const segment = document.querySelector<HTMLElement & { value: string }>(
      'ion-segment[aria-label="Photo size"]',
    )!;
    expect(segment.value).toBe('full-width');
    segment.dispatchEvent(
      new CustomEvent('ionChange', { bubbles: true, detail: { value: 'capped' } }),
    );
    expect(useDevicePrefsStore.getState().photoFit).toBe('capped');
  });
});
