// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// The inboxes' read-gate (b-oss#397): signed out, the same "You must be signed in" prompt as the
// write gate; Cancel goes to Browse, Sign in now to the sign-in screen with the inbox as the
// return target.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AccountGuardRoute } from '../AccountGuardRoute.js';
import type { TrackedHistory } from '../test-router.js';
import { t } from '../../../strings/index.js';

// IonAlert stubbed at the @ionic/react boundary (b-oss#193).
vi.mock('@ionic/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ionic/react')>();
  function IonAlert({
    isOpen,
    header,
    buttons = [],
    onDidDismiss,
  }: {
    isOpen: boolean;
    header?: string;
    buttons?: { text: string; handler?: () => void }[];
    onDidDismiss?: () => void;
  }) {
    if (!isOpen) return null;
    return (
      <div role="dialog" aria-label={header}>
        <h2>{header}</h2>
        {buttons.map((b) => (
          <button
            key={b.text}
            onClick={() => {
              b.handler?.();
              onDidDismiss?.();
            }}
          >
            {b.text}
          </button>
        ))}
      </div>
    );
  }
  return { ...actual, IonAlert };
});

vi.mock('../../../state/accountsStore.js', () => ({ useActiveAccount: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function LocationProbe({ into }: { into: TrackedHistory }) {
  into.location = useLocation();
  return null;
}

async function renderSignedOut(): Promise<TrackedHistory> {
  const { useActiveAccount } = await import('../../../state/accountsStore.js');
  vi.mocked(useActiveAccount).mockReturnValue(null);
  const tracked: TrackedHistory = {
    location: { pathname: '/', search: '', hash: '', state: null, key: 'default' },
  };
  render(
    <MemoryRouter initialEntries={['/notifications']}>
      <Routes>
        <Route
          path="/notifications"
          element={
            <AccountGuardRoute>
              <div>inbox</div>
            </AccountGuardRoute>
          }
        />
        <Route path="*" element={null} />
      </Routes>
      <LocationProbe into={tracked} />
    </MemoryRouter>,
  );
  return tracked;
}

describe('AccountGuardRoute', () => {
  it('asks a signed-out user to sign in', async () => {
    await renderSignedOut();
    expect(screen.getByText(t('SIGN_IN_REQUIRED.title'))).toBeDefined();
    expect(screen.queryByText('inbox')).toBeNull();
  });

  it('Cancel goes to Browse', async () => {
    const tracked = await renderSignedOut();
    await userEvent.click(screen.getByText(t('SIGN_IN_REQUIRED.button.cancel')));
    expect(tracked.location.pathname).toBe('/browse');
  });

  it('Sign in now goes to the sign-in screen, returning to the inbox', async () => {
    const tracked = await renderSignedOut();
    await userEvent.click(screen.getByText(t('SIGN_IN_REQUIRED.button.sign_in')));
    expect(tracked.location.pathname).toBe('/sign-in');
    expect(new URLSearchParams(tracked.location.search).get('return')).toBe('/notifications');
  });
});
