// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// FLW-01 for screen actions (b-oss#397): signed out, the action shows "You must be signed in to do
// this"; Cancel does nothing else, Sign in now goes to the sign-in screen with this screen as the
// return target.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useSignInPrompt } from '../useSignInPrompt.js';
import { t } from '../../../strings/index.js';

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

const push = vi.fn();
const replace = vi.fn();
vi.mock('../useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push, replace, goBack: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function Harness() {
  const { prompt, element } = useSignInPrompt();
  return (
    <>
      <button onClick={prompt}>Star</button>
      {element}
    </>
  );
}

function renderHarness() {
  return render(
    <MemoryRouter initialEntries={['/entry/42?from=feed']}>
      <Harness />
    </MemoryRouter>,
  );
}

describe('useSignInPrompt', () => {
  it('shows the dialog only when prompted', async () => {
    renderHarness();
    expect(screen.queryByText(t('SIGN_IN_REQUIRED.title'))).toBeNull();
    await userEvent.click(screen.getByText('Star'));
    expect(screen.getByText(t('SIGN_IN_REQUIRED.title'))).toBeDefined();
  });

  it('Cancel closes it and does nothing else', async () => {
    renderHarness();
    await userEvent.click(screen.getByText('Star'));
    await userEvent.click(screen.getByText(t('SIGN_IN_REQUIRED.button.cancel')));
    expect(screen.queryByText(t('SIGN_IN_REQUIRED.title'))).toBeNull();
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('Sign in now opens the sign-in screen with this screen as the return target', async () => {
    renderHarness();
    await userEvent.click(screen.getByText('Star'));
    await userEvent.click(screen.getByText(t('SIGN_IN_REQUIRED.button.sign_in')));
    expect(replace).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith('/sign-in?return=%2Fentry%2F42%3Ffrom%3Dfeed');
    expect(screen.queryByText(t('SIGN_IN_REQUIRED.title'))).toBeNull();
  });
});
