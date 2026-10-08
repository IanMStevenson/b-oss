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
      'Icon guide',
      'Safety & privacy',
      'Blipfoto terms & legal',
      'Blipfoto privacy policy',
      'App version',
      'Open source licences',
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText('App version').closest('ion-item')!.textContent).toMatch(/\d+\.\d+/);
  });

  it('no longer carries Delete my account or the link-handling toggle', () => {
    renderHub();
    expect(screen.queryByText('Delete my account')).toBeNull();
    expect(screen.queryByText('Open blipfoto.com links in this app')).toBeNull();
  });

  it('Help/Terms/Privacy rows each open their own real Blipfoto page directly', async () => {
    renderHub();
    const expected: Record<string, string> = {
      'Blipfoto terms & legal': 'https://www.blipfoto.com/legal/terms',
      'Blipfoto privacy policy': 'https://www.blipfoto.com/legal/privacy',
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

  it('Icon guide / Safety & privacy / Open source licences navigate in-app, not to the browser', async () => {
    renderHub();
    await userEvent.click(screen.getByText('Icon guide'));
    await userEvent.click(screen.getByText('Safety & privacy'));
    await userEvent.click(screen.getByText('Open source licences'));
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

  it('names the app licence as GPL-3.0-or-later and links to it and the source', async () => {
    render(
      <MemoryRouter>
        <HelpInfoScreen section="licences" />
      </MemoryRouter>,
    );
    expect(screen.getByText(/\(GPL-3\.0-or-later\)/)).toBeDefined();
    await userEvent.click(screen.getByText('GNU General Public License, version 3 or later'));
    expect(openUrl).toHaveBeenLastCalledWith('https://www.gnu.org/licenses/gpl-3.0.html');
    await userEvent.click(screen.getByText('b-oss website'));
    expect(openUrl).toHaveBeenLastCalledWith('https://ianmstevenson.github.io/b-oss/');
  });

  it('credits MapTiler and OpenStreetMap (ODbL) for the maps', async () => {
    render(
      <MemoryRouter>
        <HelpInfoScreen section="licences" />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Open Database License \(ODbL\)/)).toBeDefined();
    await userEvent.click(screen.getByText('OpenStreetMap contributors'));
    expect(openUrl).toHaveBeenLastCalledWith('https://www.openstreetmap.org/copyright');
    await userEvent.click(screen.getByText('MapTiler'));
    expect(openUrl).toHaveBeenLastCalledWith('https://www.maptiler.com/copyright/');
  });

  it('lists every generated library with its licence, and shows the text when one is opened', async () => {
    const { container } = render(
      <MemoryRouter>
        <HelpInfoScreen section="licences" />
      </MemoryRouter>,
    );
    const { default: generated } = await import('../licences.generated.json');
    await waitFor(() =>
      expect(container.querySelectorAll('details').length).toBe(generated.packages.length),
    );
    const zustand = generated.packages.find((p) => p.name === 'zustand')!;
    const summary = screen.getByText(`zustand ${zustand.version} — MIT`);
    expect(container.querySelector('pre')).toBeNull();

    const details = summary.closest('details')!;
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    await waitFor(() =>
      expect(details.querySelector('pre')?.textContent).toBe(generated.texts[zustand.texts[0]]),
    );
    expect(details.textContent).toContain('Permission is hereby granted');
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
