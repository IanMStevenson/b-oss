// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// The beside-the-page menu on the desktop profile (b-oss#638), and its absence elsewhere.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { AppShell } from '../AppShell.js';
import { useAccountsStore } from '../../state/accountsStore.js';
import { useDevicePrefsStore } from '../../state/devicePrefsStore.js';

// The shell boots lazily-loaded screens; the default 5 s is tight on a loaded machine.
vi.setConfig({ testTimeout: 20_000 });

const platform = vi.hoisted((): { kind: 'web' | 'desktop' } => ({ kind: 'web' }));
vi.mock('../../platform/platformKind.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/platformKind.js')>()),
  platformKind: () => platform.kind,
}));

function stubWidth(wide: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width') ? wide : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear(); // the prefs store persists to it, and hydrates from it on the next boot
  platform.kind = 'web';
  useAccountsStore.setState({ accounts: [], activeAccountId: null });
  useDevicePrefsStore.setState({ navPinned: 'auto', overrides: {} });
  window.history.pushState({}, '', '/');
});

const pane = (): { when: boolean } | null =>
  document.querySelector<HTMLElement & { when: boolean }>('ion-split-pane');

describe('AppShell navigation menu, desktop profile', () => {
  it('is open beside the page on an ordinary screen and collapses on Browse', async () => {
    platform.kind = 'desktop';
    stubWidth(true);
    window.history.pushState({}, '', '/accounts');
    render(<AppShell />);
    await screen.findByText('Add account');
    await waitFor(() => expect(pane()?.when).toBe(true));
    cleanup();

    window.history.pushState({}, '', '/browse');
    render(<AppShell />);
    await screen.findAllByText(/Browse/);
    await waitFor(() => expect(pane()?.when).toBe(false));
  });

  it('is the drawer on a narrow window', async () => {
    platform.kind = 'desktop';
    stubWidth(false);
    window.history.pushState({}, '', '/accounts');
    render(<AppShell />);
    await screen.findByText('Add account');
    expect(pane()?.when).toBe(false);
    expect(screen.queryByText('Collapse menu')).toBeNull();
    expect(screen.queryByText('Keep menu open')).toBeNull();
  });

  it('the pin button collapses an open menu, and the choice is remembered as an override', async () => {
    platform.kind = 'desktop';
    stubWidth(true);
    window.history.pushState({}, '', '/accounts');
    render(<AppShell />);
    await screen.findByText('Add account');
    fireEvent.click(await screen.findByText('Collapse menu'));
    await waitFor(() => expect(pane()?.when).toBe(false));
    expect(useDevicePrefsStore.getState().overrides.navPinned).toBe(false);
    fireEvent.click(await screen.findByText('Keep menu open'));
    await waitFor(() => expect(pane()?.when).toBe(true));
    expect(useDevicePrefsStore.getState().navPinned).toBe('auto');
  });

  it('the pin row reads label then icon, icon in the end slot, same name and pressed state (b-oss#698)', async () => {
    platform.kind = 'desktop';
    stubWidth(true);
    window.history.pushState({}, '', '/accounts');
    render(<AppShell />);
    await screen.findByText('Add account');
    const button = document.querySelector('ion-button.nav-pin') as HTMLElement;
    expect(button.textContent).toBe('Collapse menu');
    const kids = [...button.childNodes];
    expect((kids[0] as Element).className).toBe('nav-pin-label');
    const icon = kids[1] as Element;
    expect(icon.tagName.toLowerCase()).toBe('svg');
    expect(icon.getAttribute('slot')).toBe('end');
    expect(icon.getAttribute('aria-hidden')).toBe('true');
  });

  it('a pinned-open menu stays open on Browse', async () => {
    platform.kind = 'desktop';
    stubWidth(true);
    useDevicePrefsStore.setState({ navPinned: true });
    window.history.pushState({}, '', '/browse');
    render(<AppShell />);
    await screen.findAllByText(/Browse/);
    await waitFor(() => expect(pane()?.when).toBe(true));
  });
});

describe('AppShell navigation menu, handheld profile', () => {
  it('has no split pane at any width: the drawer is unchanged', async () => {
    stubWidth(true);
    window.history.pushState({}, '', '/accounts');
    render(<AppShell />);
    await screen.findByText('Add account');
    expect(pane()).toBeNull();
    expect(screen.queryByText('Collapse menu')).toBeNull();
    expect(document.querySelector('ion-menu')).not.toBeNull();
  });
});
