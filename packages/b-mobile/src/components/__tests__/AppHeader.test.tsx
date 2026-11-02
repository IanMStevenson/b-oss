// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { IonPage, IonContent } from '@ionic/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { AppHeader } from '../AppHeader.js';
import { OverlayProvider } from '../../app/OverlayProvider.js';
import { useAccountsStore } from '../../state/accountsStore.js';
import type { StoredAccount } from '../../state/accountsStore.js';

vi.mock('../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

function account(id: string, username: string): StoredAccount {
  return {
    id,
    username,
    avatarUrl: null,
    appTokenScope: 'read,write',
    hasServiceToken: false,
    notificationRegistrationId: null,
    notificationStatus: null,
  };
}

function setAccounts(n: number) {
  const accounts = [account('a1', 'one'), account('a2', 'two')].slice(0, n);
  useAccountsStore.setState({ accounts, activeAccountId: accounts[0]?.id ?? null, hydrated: true });
}

function renderHeader(props: Partial<React.ComponentProps<typeof AppHeader>> = {}) {
  return render(
    <MemoryRouter>
      <OverlayProvider>
        <AppHeader title="Title" {...props} />
      </OverlayProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => setAccounts(2));
afterEach(cleanup);

const indicator = () => screen.queryByLabelText(/Switch account/);

describe('AppHeader', () => {
  it('menu variant shows the menu button; back variant shows the back button', () => {
    renderHeader();
    expect(document.querySelector('ion-menu-button')).not.toBeNull();
    expect(document.querySelector('ion-back-button')).toBeNull();
    cleanup();
    renderHeader({ variant: 'back' });
    expect(document.querySelector('ion-back-button')).not.toBeNull();
    expect(document.querySelector('ion-menu-button')).toBeNull();
  });

  it('onBack uses the same back button (same arrow icon), not a bespoke chevron, and replaces navigation', async () => {
    const onBack = vi.fn();
    renderHeader({ variant: 'back', onBack });
    expect(document.querySelector('ion-back-button')).not.toBeNull();
    expect(document.querySelector('svg')).toBeNull();
    await userEvent.click(document.querySelector('ion-back-button') as HTMLElement);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('mounts the account indicator by default on the menu variant, not on the back variant', () => {
    renderHeader();
    expect(indicator()).not.toBeNull();
    cleanup();
    renderHeader({ variant: 'back' });
    expect(indicator()).toBeNull();
  });

  it('accountIndicator overrides the default either way', () => {
    renderHeader({ accountIndicator: false });
    expect(indicator()).toBeNull();
    cleanup();
    renderHeader({ variant: 'back', accountIndicator: true });
    expect(indicator()).not.toBeNull();
  });

  it('mounts nothing with fewer than two accounts', () => {
    setAccounts(1);
    renderHeader();
    expect(indicator()).toBeNull();
  });

  it('title margin is the same whether or not `end` or the indicator renders', () => {
    const marginOf = () => screen.getByText('Title').style.marginRight;
    renderHeader();
    const withIndicator = marginOf();
    cleanup();
    setAccounts(1);
    renderHeader({ end: <button>x</button> });
    expect(marginOf()).toBe(withIndicator);
    cleanup();
    renderHeader({ accountIndicator: false });
    expect(marginOf()).toBe(withIndicator);
  });

  it('renders `end` content before the indicator', () => {
    renderHeader({ end: <button aria-label="Extra">x</button> });
    const extra = screen.getByLabelText('Extra');
    expect(
      extra.compareDocumentPosition(indicator() as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  describe('arrival decides ☰ or ← (b-oss#732)', () => {
    function Where() {
      return <span data-testid="at">{useLocation().pathname}</span>;
    }
    function Opener() {
      const navigate = useAppNavigate();
      return <button onClick={() => navigate.push('/map')}>open map</button>;
    }
    function renderApp(initialEntries: string[], initialIndex?: number) {
      return render(
        <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
          <OverlayProvider>
            <Where />
            <Routes>
              <Route
                path="/browse"
                element={
                  <>
                    <AppHeader title="Browse" />
                    <Opener />
                  </>
                }
              />
              <Route path="/map" element={<AppHeader title="Map" />} />
              <Route path="/entry/1" element={<AppHeader title="Entry" variant="back" />} />
            </Routes>
          </OverlayProvider>
        </MemoryRouter>,
      );
    }

    it('menu-reached screen shows ☰', () => {
      renderApp(['/map']);
      expect(document.querySelector('ion-menu-button')).not.toBeNull();
      expect(document.querySelector('ion-back-button')).toBeNull();
    });

    it('the same screen reached by tapping something inside another screen shows ←', async () => {
      renderApp(['/browse']);
      expect(document.querySelector('ion-menu-button')).not.toBeNull();
      await userEvent.click(screen.getByText('open map'));
      expect(screen.getByTestId('at').textContent).toBe('/map');
      expect(document.querySelector('ion-back-button')).not.toBeNull();
      expect(document.querySelector('ion-menu-button')).toBeNull();
    });

    it('a deep link to a never-in-the-menu screen (no history) still shows ←', () => {
      renderApp(['/entry/1']);
      expect(document.querySelector('ion-back-button')).not.toBeNull();
    });
  });

  describe('tapping b-mobile goes home (b-oss#731)', () => {
    const homeButton = () => screen.getByRole('button', { name: /b-mobile/ });

    function renderAt(path: string, props: Partial<React.ComponentProps<typeof AppHeader>> = {}) {
      let at = '';
      function Where() {
        at = useLocation().pathname;
        return null;
      }
      render(
        <MemoryRouter initialEntries={['/browse', path]} initialIndex={1}>
          <OverlayProvider>
            <Where />
            <AppHeader title="Title" {...props} />
          </OverlayProvider>
        </MemoryRouter>,
      );
      return () => at;
    }

    it('is a button with an accessible name, in both header variants', () => {
      renderAt('/map');
      expect(homeButton()).toBeDefined();
      cleanup();
      renderAt('/entry/1', { variant: 'back' });
      expect(homeButton()).toBeDefined();
    });

    it('goes to Browse from a menu-variant and from a back-variant screen', async () => {
      const at = renderAt('/map');
      await userEvent.click(homeButton());
      expect(at()).toBe('/browse');
      cleanup();
      const at2 = renderAt('/entry/1', { variant: 'back' });
      await userEvent.click(homeButton());
      expect(at2()).toBe('/browse');
    });

    it('on Browse it stays put and scrolls the page to the top', async () => {
      const scrollToTop = vi.fn();
      const { container } = render(
        <MemoryRouter initialEntries={['/browse']}>
          <OverlayProvider>
            <IonPage>
              <AppHeader title="Browse" />
              <IonContent />
            </IonPage>
          </OverlayProvider>
        </MemoryRouter>,
      );
      (container.querySelector('ion-content') as unknown as { scrollToTop: unknown }).scrollToTop =
        scrollToTop;
      await userEvent.click(homeButton());
      expect(scrollToTop).toHaveBeenCalled();
    });

    it('lets a screen with unsaved changes intercept, and goes home only when it says so', async () => {
      let proceed: (() => void) | undefined;
      const at = renderAt('/compose/details', {
        variant: 'back',
        onHome: (goHome) => {
          proceed = goHome;
        },
      });
      await userEvent.click(homeButton());
      expect(at()).toBe('/compose/details');
      act(() => proceed?.());
      expect(at()).toBe('/browse');
    });
  });
});
