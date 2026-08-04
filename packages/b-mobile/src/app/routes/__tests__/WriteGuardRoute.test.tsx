// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// FLW-01/FLW-11's "anonymous always goes to sign-in, never the upgrade prompt" rule, and the
// existing read-only-sees-the-upgrade-prompt behaviour, exercised together since a regression in
// either direction is exactly the kind of thing §19 flags as worth a direct test.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WriteGuardRoute } from '../WriteGuardRoute.js';

const { signInGated } = vi.hoisted(() => ({ signInGated: vi.fn() }));
vi.mock('../../../flows/accountsFlow.js', () => ({ signInGated }));

vi.mock('../../../state/accountsStore.js', () => ({
  useActiveAccount: vi.fn(),
  useCanWrite: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderGuard() {
  return render(
    <MemoryRouter>
      <WriteGuardRoute exact path="/" render={() => <div>write screen</div>} />
    </MemoryRouter>,
  );
}

describe('WriteGuardRoute', () => {
  it('renders the guarded route when the active account can write', async () => {
    const { useActiveAccount, useCanWrite } = await import('../../../state/accountsStore.js');
    vi.mocked(useActiveAccount).mockReturnValue({
      id: 'a1',
      username: 'alice',
      avatarUrl: null,
      appTokenScope: 'read,write',
      hasServiceToken: false,
      notificationRegistrationId: null,
      notificationStatus: null,
    });
    vi.mocked(useCanWrite).mockReturnValue(true);
    renderGuard();
    expect(screen.getByText('write screen')).toBeDefined();
    expect(signInGated).not.toHaveBeenCalled();
  });

  it('triggers a gated sign-in round for an anonymous user, never the read-only upgrade prompt', async () => {
    const { useActiveAccount, useCanWrite } = await import('../../../state/accountsStore.js');
    vi.mocked(useActiveAccount).mockReturnValue(null);
    vi.mocked(useCanWrite).mockReturnValue(false);
    signInGated.mockReturnValue(new Promise(() => {}));
    renderGuard();
    expect(signInGated).toHaveBeenCalledOnce();
    expect(screen.queryByText('Read-only account')).toBeNull();
    expect(screen.queryByText('write screen')).toBeNull();
  });

  it('shows the upgrade prompt for a signed-in, read-only account', async () => {
    const { useActiveAccount, useCanWrite } = await import('../../../state/accountsStore.js');
    vi.mocked(useActiveAccount).mockReturnValue({
      id: 'a1',
      username: 'alice',
      avatarUrl: null,
      appTokenScope: 'read',
      hasServiceToken: false,
      notificationRegistrationId: null,
      notificationStatus: null,
    });
    vi.mocked(useCanWrite).mockReturnValue(false);
    renderGuard();
    expect(await screen.findByText('Read-only account')).toBeDefined();
    expect(signInGated).not.toHaveBeenCalled();
  });
});
