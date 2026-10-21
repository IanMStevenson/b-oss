// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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
});
