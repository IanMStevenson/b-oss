// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HelpInfoScreen } from '../HelpInfoScreen.js';
import { OverlayProvider, OverlayHost } from '../../../app/OverlayProvider.js';

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
  it('lists the Help and About sections with their rows, and the app version', () => {
    renderHub();
    for (const label of [
      'Help',
      'About',
      'Icon Guide',
      'Safety & Privacy',
      'Blipfoto Terms & Legal',
      'Blipfoto Privacy Policy',
      'App Version',
      'Open Source Licenses',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('App Version').closest('ion-item')!.textContent).toMatch(/\d+\.\d+/);
  });

  it('no longer carries Delete my account or the link-handling toggle', () => {
    renderHub();
    expect(screen.queryByText('Delete my account')).toBeNull();
    expect(screen.queryByText('Open blipfoto.com links in this app')).toBeNull();
  });

  it('Help/Terms/Privacy rows each open their own real Blipfoto page directly', async () => {
    renderHub();
    const expected: Record<string, string> = {
      'Blipfoto Terms & Legal': 'https://www.blipfoto.com/legal/terms',
      'Blipfoto Privacy Policy': 'https://www.blipfoto.com/legal/privacy',
    };
    for (const [label, url] of Object.entries(expected)) {
      await userEvent.click(screen.getByText(label));
      expect(openUrl).toHaveBeenLastCalledWith(url);
    }
    // the first "Help" is the section caption, the second the row
    const helpRow = screen.getAllByText('Help')[1];
    await userEvent.click(helpRow);
    expect(openUrl).toHaveBeenLastCalledWith('https://www.blipfoto.com/help');
    expect(openUrl).toHaveBeenCalledTimes(3);
  });

  it('Icon Guide / Safety & Privacy / Open Source Licenses navigate in-app, not to the browser', async () => {
    renderHub();
    await userEvent.click(screen.getByText('Icon Guide'));
    await userEvent.click(screen.getByText('Safety & Privacy'));
    await userEvent.click(screen.getByText('Open Source Licenses'));
    expect(push).toHaveBeenCalledWith('/help/icon-guide');
    expect(push).toHaveBeenCalledWith('/help/safety-privacy');
    expect(push).toHaveBeenCalledWith('/help/licences');
    expect(openUrl).not.toHaveBeenCalled();
  });
});

describe('HelpInfoScreen sections', () => {
  it('renders the icon guide', async () => {
    render(
      <MemoryRouter>
        <HelpInfoScreen section="icon-guide" />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Badges next to a member/)).toBeDefined();
    expect(screen.getByText('Entries')).toBeDefined();
    expect(screen.queryByText(/[Pp]ledge/)).toBeNull();
    expect(screen.getByText('Other')).toBeDefined();
    expect(screen.getByText('Full Member')).toBeDefined();
    // 13 real icon_ids the API ever returns (10 entry-level tiers + milestone/member/staff) —
    // confirmed against Blipfoto's own static icon set, not the website's full (unused) set.
    // CachedImage resolves its src asynchronously even off-native (its own effect), so the actual
    // <img> tags land a tick after render.
    await waitFor(() => expect(document.querySelectorAll('img').length).toBe(13));
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
    expect(screen.getByText('@ionic/react and @ionic/react-router')).toBeDefined();
    // the rich-text comment editor's ProseMirror packages are shipped, so must be listed
    expect(screen.getByText(/^ProseMirror/)).toBeDefined();
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
    expect(screen.getByText('Icon Guide')).toBeDefined();
  });
});
