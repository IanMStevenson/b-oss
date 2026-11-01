// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AppearanceSection } from '../sections/AppearanceSection.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { useDevicePrefsStore } from '../../../state/devicePrefsStore.js';

vi.mock('../../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

function acct(id: string, username: string) {
  return {
    id,
    username,
    avatarUrl: null,
    appTokenScope: 'read,write' as const,
    hasServiceToken: false,
    notificationRegistrationId: null,
    notificationStatus: null,
  };
}

function flip(el: HTMLElement, checked: boolean) {
  el.dispatchEvent(new CustomEvent('ionChange', { bubbles: true, detail: { checked } }));
}

beforeEach(() => {
  useDevicePrefsStore.setState({
    showZoomBar: true,
    showPagination: true,
    thumbnailMargins: 'normal',
    photoFit: 'full-width',
    openBlipfotoLinksInApp: false,
    accountAvatarStyle: 'picture',
    theme: 'system',
  });
  useAccountsStore.setState({
    accounts: [acct('a1', 'alice')],
    activeAccountId: 'a1',
    hydrated: true,
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('AppearanceSection', () => {
  it('shows both toggles on, and Normal selected, by default', () => {
    render(<AppearanceSection />);
    const zoomToggle = screen.getByLabelText('Show zoom/navigation bar');
    const paginationToggle = screen.getByLabelText('Show pagination');
    expect(zoomToggle.getAttribute('checked')).not.toBe('false');
    expect(paginationToggle.getAttribute('checked')).not.toBe('false');
    // IonLabel doesn't reliably render its children in this jsdom setup (SettingsScreen.tsx's own
    // header comment documents the same gotcha) — assert via the segment's own value instead.
    expect(
      document.querySelector<HTMLElement & { value: string }>('ion-segment[aria-label="Margins"]')!
        .value,
    ).toBe('normal');
  });

  it('says changes apply immediately, with no Save button', () => {
    render(<AppearanceSection />);
    expect(screen.getByText('Changes apply immediately.')).toBeDefined();
    expect(screen.queryByText('Save')).toBeNull();
  });

  it('toggling the zoom bar toggle persists immediately', () => {
    render(<AppearanceSection />);
    const toggle = screen.getByLabelText('Show zoom/navigation bar');
    toggle.dispatchEvent(
      new CustomEvent('ionChange', { bubbles: true, detail: { checked: false } }),
    );
    expect(useDevicePrefsStore.getState().showZoomBar).toBe(false);
  });

  it('toggling the pagination toggle persists immediately', () => {
    render(<AppearanceSection />);
    const toggle = screen.getByLabelText('Show pagination');
    toggle.dispatchEvent(
      new CustomEvent('ionChange', { bubbles: true, detail: { checked: false } }),
    );
    expect(useDevicePrefsStore.getState().showPagination).toBe(false);
  });

  it('changing the margins segment persists the new value', () => {
    render(<AppearanceSection />);
    const segment = document.querySelector('ion-segment[aria-label="Margins"]')!;
    segment.dispatchEvent(
      new CustomEvent('ionChange', { bubbles: true, detail: { value: 'narrow' } }),
    );
    expect(useDevicePrefsStore.getState().thumbnailMargins).toBe('narrow');
  });

  it('photo size defaults to full width and persists Fit to screen', () => {
    render(<AppearanceSection />);
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

describe('AppearanceSection — theme', () => {
  function themeSegment() {
    return document.querySelector<HTMLElement & { value: string }>(
      'ion-segment[aria-label="Theme"]',
    )!;
  }

  it('offers System, Light, Dark and Mid even with one account, defaulting to System', () => {
    render(<AppearanceSection />);
    const segment = themeSegment();
    expect(segment.classList.contains('settings-pill-segment')).toBe(true);
    expect(segment.value).toBe('system');
    const labels = Array.from(segment.querySelectorAll('ion-segment-button')).map(
      (b) => b.textContent,
    );
    expect(labels).toEqual(['System', 'Light', 'Dark', 'Mid']);
  });

  it('persists the choice', () => {
    render(<AppearanceSection />);
    themeSegment().dispatchEvent(
      new CustomEvent('ionChange', { bubbles: true, detail: { value: 'mid' } }),
    );
    expect(useDevicePrefsStore.getState().theme).toBe('mid');
  });
});

describe('AppearanceSection — account picture', () => {
  it('is hidden with fewer than two accounts', () => {
    render(<AppearanceSection />);
    expect(document.querySelector('ion-segment[aria-label="Account picture"]')).toBeNull();
  });

  it('is offered with two or more accounts, and persists', () => {
    useAccountsStore.setState({ accounts: [acct('a1', 'alice'), acct('a2', 'bob')] });
    render(<AppearanceSection />);
    const segment = document.querySelector<HTMLElement & { value: string }>(
      'ion-segment[aria-label="Account picture"]',
    )!;
    expect(segment.classList.contains('settings-pill-segment')).toBe(true);
    expect(segment.value).toBe('picture');
    segment.dispatchEvent(
      new CustomEvent('ionChange', { bubbles: true, detail: { value: 'icon' } }),
    );
    expect(useDevicePrefsStore.getState().accountAvatarStyle).toBe('icon');
  });
});

describe('AppearanceSection — links', () => {
  it('has a captioned Links section; the toggle defaults off and persists when flipped', () => {
    render(<AppearanceSection />);
    expect(screen.getByText('Links')).toBeDefined();
    expect(screen.getByText(/blipfoto\.com links you tap in other apps/)).toBeDefined();
    const toggle = screen.getByLabelText('Open blipfoto.com links in this app');
    expect(toggle.getAttribute('checked')).not.toBe('true');
    flip(toggle, true);
    expect(useDevicePrefsStore.getState().openBlipfotoLinksInApp).toBe(true);
  });

  it('is usable signed out', () => {
    useAccountsStore.setState({ accounts: [], activeAccountId: null, hydrated: true });
    render(<AppearanceSection />);
    flip(screen.getByLabelText('Open blipfoto.com links in this app'), true);
    expect(useDevicePrefsStore.getState().openBlipfotoLinksInApp).toBe(true);
  });
});
