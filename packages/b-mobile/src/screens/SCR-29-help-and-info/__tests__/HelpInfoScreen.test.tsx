// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelpInfoScreen } from '../HelpInfoScreen.js';
import { OverlayProvider, OverlayHost } from '../../../app/OverlayProvider.js';
import { useDevicePrefsStore } from '../../../state/devicePrefsStore.js';

const { openUrl } = vi.hoisted(() => ({ openUrl: vi.fn() }));
vi.mock('../../../platform/browser.js', () => ({ openUrl }));

vi.mock('../../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

const push = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push, replace: vi.fn(), goBack: vi.fn() }),
}));

beforeEach(() => {
  openUrl.mockResolvedValue(undefined);
  useDevicePrefsStore.setState({
    confirmAccountBeforeReaction: false,
    reminders: {},
    uploadFullSize: true,
    openBlipfotoLinksInApp: false,
    notificationPollingIntervalMinutes: 5,
    hydrated: true,
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderHub() {
  return render(
    <MemoryRouter>
      <OverlayProvider>
        <OverlayHost />
        <HelpInfoScreen />
      </OverlayProvider>
    </MemoryRouter>,
  );
}

describe('HelpInfoScreen hub — works with no account signed in (SCR-29 is not account-gated)', () => {
  it('lists every row, including the app version', () => {
    renderHub();
    for (const label of [
      'Icon guide',
      'Safety & privacy',
      'Help',
      'Terms & legal',
      'Privacy policy',
      'Delete my account',
      'Open blipfoto.com links in this app',
      'Open-source licences',
    ]) {
      expect(screen.getByText(label)).toBeDefined();
    }
    expect(screen.getByText(/App version/)).toBeDefined();
  });

  it('Help/Terms/Privacy policy/Delete my account each open their own real Blipfoto page', async () => {
    renderHub();
    const expected: Record<string, string> = {
      Help: 'https://www.blipfoto.com/help',
      'Terms & legal': 'https://www.blipfoto.com/legal/terms',
      'Privacy policy': 'https://www.blipfoto.com/legal/privacy',
      'Delete my account': 'https://www.blipfoto.com/settings/profile#sidebar',
    };
    for (const [label, url] of Object.entries(expected)) {
      await userEvent.click(screen.getByText(label));
      expect(openUrl).toHaveBeenLastCalledWith(url);
    }
    expect(openUrl).toHaveBeenCalledTimes(4);
  });

  it('the Delete my account row never names a specific stored account', () => {
    renderHub();
    const row = screen.getByText('Delete my account').closest('ion-item')!;
    expect(row.textContent).not.toMatch(/'s account/);
  });

  it('Icon guide / Safety & privacy / Open-source licences navigate in-app, not to the browser', async () => {
    renderHub();
    await userEvent.click(screen.getByText('Icon guide'));
    await userEvent.click(screen.getByText('Safety & privacy'));
    await userEvent.click(screen.getByText('Open-source licences'));
    expect(push).toHaveBeenCalledWith('/help/icon-guide');
    expect(push).toHaveBeenCalledWith('/help/safety-privacy');
    expect(push).toHaveBeenCalledWith('/help/licences');
    expect(openUrl).not.toHaveBeenCalled();
  });

  it('the link-handling toggle defaults off and persists when flipped', () => {
    renderHub();
    const toggle = screen.getByText('Open blipfoto.com links in this app').closest('ion-checkbox')!;
    expect(toggle.getAttribute('checked')).not.toBe('true');

    toggle.dispatchEvent(
      new CustomEvent('ionChange', { bubbles: true, detail: { checked: true } }),
    );
    expect(useDevicePrefsStore.getState().openBlipfotoLinksInApp).toBe(true);
  });
});

describe('HelpInfoScreen sections', () => {
  it('renders the icon guide', () => {
    render(
      <MemoryRouter>
        <HelpInfoScreen section="icon-guide" />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Badges and icons/)).toBeDefined();
  });

  it('renders the safety & privacy explainer distinguishing hide/remove/refuse', () => {
    render(
      <MemoryRouter>
        <HelpInfoScreen section="safety-privacy" />
      </MemoryRouter>,
    );
    expect(screen.getByText('Hide a member', { exact: false })).toBeDefined();
    expect(screen.getByText('Remove a follower', { exact: false })).toBeDefined();
    expect(screen.getByText('Refuse a follow request', { exact: false })).toBeDefined();
  });

  it('links out to the acceptable use policy and Be Excellent to Each Other', async () => {
    render(
      <MemoryRouter>
        <HelpInfoScreen section="safety-privacy" />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByText('Blipfoto’s acceptable use policy'));
    expect(openUrl).toHaveBeenLastCalledWith('https://www.blipfoto.com/legal/acceptable-use');
    await userEvent.click(screen.getByText('Be excellent to each other'));
    expect(openUrl).toHaveBeenLastCalledWith('https://www.blipfoto.com/be-excellent');
  });

  it('renders open-source licences', () => {
    render(
      <MemoryRouter>
        <HelpInfoScreen section="licences" />
      </MemoryRouter>,
    );
    expect(screen.getByText('@ionic/react')).toBeDefined();
  });

  it('falls back to the hub for an unrecognised section', () => {
    render(
      <MemoryRouter>
        <OverlayProvider>
          <OverlayHost />
          <HelpInfoScreen section="not-a-real-section" />
        </OverlayProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('Icon guide')).toBeDefined();
  });
});
