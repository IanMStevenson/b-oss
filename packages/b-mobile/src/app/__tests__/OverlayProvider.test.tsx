// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// Phase 12.1 — OverlayProvider/useOverlay went from a dead stub (OverlayState only ever `{kind:
// null}`, zero consumers) to the real, shared mechanism every screen's upgrade prompt now routes
// through. Direct test of the primitive itself, same reasoning as platform/http.test.ts: this is
// now real branching logic worth its own density, not just something exercised incidentally
// through whichever screen happens to trigger it.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OverlayProvider, OverlayHost, useOverlay } from '../OverlayProvider.js';
import { useAccountsStore } from '../../state/accountsStore.js';
import { t } from '../../strings/index.js';

const push = vi.fn();
vi.mock('../routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push, replace: vi.fn(), goBack: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  useAccountsStore.setState({ accounts: [], activeAccountId: null, hydrated: true });
});

function TestConsumer() {
  const { showUpgradePrompt, showFirstRunExplainer, dismiss, overlay } = useOverlay();
  return (
    <div>
      <span>kind:{overlay.kind ?? 'none'}</span>
      <button onClick={showUpgradePrompt}>trigger upgrade</button>
      <button onClick={showFirstRunExplainer}>trigger explainer</button>
      <button onClick={dismiss}>trigger dismiss</button>
    </div>
  );
}

function renderWithHost() {
  return render(
    <MemoryRouter>
      <OverlayProvider>
        <OverlayHost />
        <TestConsumer />
      </OverlayProvider>
    </MemoryRouter>,
  );
}

describe('useOverlay', () => {
  it('throws when used outside OverlayProvider', () => {
    function Bare() {
      useOverlay();
      return null;
    }
    expect(() => render(<Bare />)).toThrow('useOverlay must be used within OverlayProvider');
  });

  it('starts with no overlay open', () => {
    renderWithHost();
    expect(screen.getByText('kind:none')).toBeDefined();
    expect(screen.queryByText(t('UPGRADE.title'))).toBeNull();
  });

  it('showUpgradePrompt opens the upgrade-prompt overlay, rendered by OverlayHost', async () => {
    renderWithHost();
    await userEvent.click(screen.getByText('trigger upgrade'));
    expect(screen.getByText('kind:upgrade-prompt')).toBeDefined();
    expect(await screen.findByText(t('UPGRADE.title'))).toBeDefined();
  });

  it("names the active account in the upgrade prompt's body", async () => {
    useAccountsStore.setState({
      accounts: [
        {
          id: 'a1',
          username: 'alex',
          avatarUrl: null,
          appTokenScope: 'read',
          hasServiceToken: false,
          notificationRegistrationId: null,
          notificationStatus: null,
        },
      ],
      activeAccountId: 'a1',
      hydrated: true,
    });
    renderWithHost();
    await userEvent.click(screen.getByText('trigger upgrade'));
    expect(await screen.findByText(t('UPGRADE.body', { username: 'alex' }))).toBeDefined();
  });

  it(`"${t('UPGRADE.button.confirm')}" on the upgrade prompt navigates to accounts`, async () => {
    renderWithHost();
    await userEvent.click(screen.getByText('trigger upgrade'));
    await screen.findByText(t('UPGRADE.title'));
    await userEvent.click(screen.getByText(t('UPGRADE.button.confirm')));
    expect(push).toHaveBeenCalledWith('/accounts');
  });

  it('showFirstRunExplainer opens the explainer overlay, rendered by OverlayHost', async () => {
    renderWithHost();
    await userEvent.click(screen.getByText('trigger explainer'));
    expect(screen.getByText('kind:first-run-explainer')).toBeDefined();
    expect(await screen.findByText(t('SCR-01.explainer.first_run.title'))).toBeDefined();
  });

  it('dismiss closes whichever overlay is open', async () => {
    renderWithHost();
    await userEvent.click(screen.getByText('trigger upgrade'));
    await screen.findByText(t('UPGRADE.title'));
    await userEvent.click(screen.getByText('trigger dismiss'));
    expect(screen.getByText('kind:none')).toBeDefined();
  });
});
