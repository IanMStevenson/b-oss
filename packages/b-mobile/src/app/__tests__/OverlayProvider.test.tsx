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

const push = vi.fn();
vi.mock('../routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push, replace: vi.fn(), goBack: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
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
    expect(screen.queryByText('Read-only account')).toBeNull();
  });

  it('showUpgradePrompt opens the upgrade-prompt overlay, rendered by OverlayHost', async () => {
    renderWithHost();
    await userEvent.click(screen.getByText('trigger upgrade'));
    expect(screen.getByText('kind:upgrade-prompt')).toBeDefined();
    expect(await screen.findByText('Read-only account')).toBeDefined();
  });

  it('"Manage accounts" on the upgrade prompt navigates there', async () => {
    renderWithHost();
    await userEvent.click(screen.getByText('trigger upgrade'));
    await screen.findByText('Read-only account');
    await userEvent.click(screen.getByText('Manage accounts'));
    expect(push).toHaveBeenCalledWith('/accounts');
  });

  it('showFirstRunExplainer opens the explainer overlay, rendered by OverlayHost', async () => {
    renderWithHost();
    await userEvent.click(screen.getByText('trigger explainer'));
    expect(screen.getByText('kind:first-run-explainer')).toBeDefined();
    expect(await screen.findByText('Two ways to sign in')).toBeDefined();
  });

  it('dismiss closes whichever overlay is open', async () => {
    renderWithHost();
    await userEvent.click(screen.getByText('trigger upgrade'));
    await screen.findByText('Read-only account');
    await userEvent.click(screen.getByText('trigger dismiss'));
    expect(screen.getByText('kind:none')).toBeDefined();
  });
});
