// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// FLW-01/FLW-11's "anonymous always goes to sign-in, never the upgrade prompt" rule, and the
// existing read-only-sees-the-upgrade-prompt behaviour, exercised together since a regression in
// either direction is exactly the kind of thing §19 flags as worth a direct test. Signed out, the
// guard asks first instead of starting a sign-in itself (b-oss#397).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { WriteGuardRoute } from '../WriteGuardRoute.js';
import type { TrackedHistory } from '../test-router.js';
import { t } from '../../../strings/index.js';
import type { StoredAccount } from '../../../state/accountsStore.js';

// IonAlert stubbed at the @ionic/react boundary (b-oss#193 — Ionic's animated overlays drop clicks
// in jsdom under load).
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

vi.mock('../../../state/accountsStore.js', () => ({
  useActiveAccount: vi.fn(),
  useCanWrite: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function account(scope: StoredAccount['appTokenScope']): StoredAccount {
  return {
    id: 'a1',
    username: 'alice',
    avatarUrl: null,
    appTokenScope: scope,
    hasServiceToken: false,
    notificationRegistrationId: null,
    notificationStatus: null,
  };
}

async function signedInAs(active: StoredAccount | null, canWrite: boolean) {
  const { useActiveAccount, useCanWrite } = await import('../../../state/accountsStore.js');
  vi.mocked(useActiveAccount).mockReturnValue(active);
  vi.mocked(useCanWrite).mockReturnValue(canWrite);
}

function renderGuard() {
  return render(
    <MemoryRouter>
      <WriteGuardRoute>
        <div>write screen</div>
      </WriteGuardRoute>
    </MemoryRouter>,
  );
}

function LocationProbe({ into }: { into: TrackedHistory }) {
  into.location = useLocation();
  return null;
}

// Arrives at /compose from /browse, so Back has somewhere to go.
function renderGuardAtCompose(): TrackedHistory {
  const tracked: TrackedHistory = {
    location: { pathname: '/', search: '', hash: '', state: null, key: 'default' },
  };
  render(
    <MemoryRouter initialEntries={['/browse', '/compose']} initialIndex={1}>
      <Routes>
        <Route
          path="/compose"
          element={
            <WriteGuardRoute>
              <div>write screen</div>
            </WriteGuardRoute>
          }
        />
        <Route path="*" element={null} />
      </Routes>
      <LocationProbe into={tracked} />
    </MemoryRouter>,
  );
  return tracked;
}

describe('WriteGuardRoute', () => {
  it('renders the guarded route when the active account can write', async () => {
    await signedInAs(account('read,write'), true);
    renderGuard();
    expect(screen.getByText('write screen')).toBeDefined();
    expect(screen.queryByText(t('SIGN_IN_REQUIRED.title'))).toBeNull();
  });

  it('asks an anonymous user to sign in instead of a blank page, never the upgrade prompt', async () => {
    await signedInAs(null, false);
    renderGuard();
    expect(screen.getByText(t('SIGN_IN_REQUIRED.title'))).toBeDefined();
    expect(screen.getByText(t('SIGN_IN_REQUIRED.button.sign_in'))).toBeDefined();
    expect(screen.queryByText(t('UPGRADE.title'))).toBeNull();
    expect(screen.queryByText('write screen')).toBeNull();
  });

  it('Cancel goes back to where the user came from', async () => {
    await signedInAs(null, false);
    const tracked = renderGuardAtCompose();
    await userEvent.click(screen.getByText(t('SIGN_IN_REQUIRED.button.cancel')));
    expect(tracked.location.pathname).toBe('/browse');
  });

  it('Sign in now replaces the route with the sign-in screen, returning here afterwards', async () => {
    await signedInAs(null, false);
    const tracked = renderGuardAtCompose();
    await userEvent.click(screen.getByText(t('SIGN_IN_REQUIRED.button.sign_in')));
    expect(tracked.location.pathname).toBe('/sign-in');
    expect(new URLSearchParams(tracked.location.search).get('return')).toBe('/compose');
  });

  it('shows the upgrade prompt for a signed-in, read-only account', async () => {
    await signedInAs(account('read'), false);
    renderGuard();
    expect(await screen.findByText(t('UPGRADE.title'))).toBeDefined();
    expect(screen.queryByText(t('SIGN_IN_REQUIRED.title'))).toBeNull();
  });
});
