// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NetworkError } from '@b-oss/b-api';
import { createTrackedRouter } from '../../../app/routes/test-router.js';
import { OverlayProvider } from '../../../app/OverlayProvider.js';
import { DescriptionEditorScreen } from '../DescriptionEditorScreen.js';

const goBack = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push: vi.fn(), replace: vi.fn(), goBack }),
}));

const isOnline = vi.hoisted(() => vi.fn());
vi.mock('../../../platform/connectivity.js', () => ({ isOnline }));

const { fetchUserSettings, saveUserSettings } = vi.hoisted(() => ({
  fetchUserSettings: vi.fn(),
  saveUserSettings: vi.fn(),
}));
vi.mock('../../../data/settings.js', () => ({ fetchUserSettings, saveUserSettings }));

beforeEach(() => {
  fetchUserSettings.mockResolvedValue({ biography: 'About me' });
  saveUserSettings.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen() {
  const { tracked, wrap } = createTrackedRouter();
  render(
    wrap(
      <OverlayProvider>
        <DescriptionEditorScreen />
      </OverlayProvider>,
    ),
  );
  return tracked;
}

describe('DescriptionEditorScreen (biography)', () => {
  it('loads the current biography into the editor', async () => {
    renderScreen();
    const box = await screen.findByPlaceholderText<HTMLTextAreaElement>(
      'Tell people about yourself…',
    );
    expect(box.value).toBe('About me');
  });

  it('says it is offline when the load cannot reach Blipfoto, and Try again reloads', async () => {
    isOnline.mockResolvedValue(false);
    fetchUserSettings.mockRejectedValueOnce(new NetworkError('offline'));
    renderScreen();
    expect(await screen.findByText('You seem to be offline')).toBeDefined();
    await userEvent.click(screen.getByText('Try again'));
    const box = await screen.findByPlaceholderText<HTMLTextAreaElement>(
      'Tell people about yourself…',
    );
    expect(box.value).toBe('About me');
  });

  it('shows all five BBCode buttons, including link', async () => {
    renderScreen();
    await screen.findByPlaceholderText('Tell people about yourself…');
    for (const label of ['B', 'I', 'U', 'S', 'Link']) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it('OK saves the edited text and returns', async () => {
    renderScreen();
    const box = await screen.findByPlaceholderText('Tell people about yourself…');
    await userEvent.clear(box);
    await userEvent.type(box, 'New bio');
    await userEvent.click(screen.getByText('OK'));
    await waitFor(() => expect(saveUserSettings).toHaveBeenCalledWith({ biography: 'New bio' }));
    expect(goBack).toHaveBeenCalled();
  });

  it('confirms discard when going back with changes', async () => {
    renderScreen();
    await userEvent.type(await screen.findByPlaceholderText('Tell people about yourself…'), '!');
    await userEvent.click(document.querySelector('ion-back-button') as HTMLElement);
    expect(await screen.findByText('Discard changes?')).toBeDefined();
    expect(goBack).not.toHaveBeenCalled();
  });

  it('home tap with no changes goes straight to Browse', async () => {
    const tracked = renderScreen();
    await screen.findByPlaceholderText('Tell people about yourself…');
    await userEvent.click(screen.getByRole('button', { name: /b-mobile/ }));
    expect(tracked.location.pathname).toBe('/browse');
  });

  it('home tap with changes asks to discard first, then goes to Browse', async () => {
    const tracked = renderScreen();
    await userEvent.type(await screen.findByPlaceholderText('Tell people about yourself…'), '!');
    await userEvent.click(screen.getByRole('button', { name: /b-mobile/ }));
    expect(await screen.findByText('Discard changes?')).toBeDefined();
    expect(tracked.location.pathname).toBe('/');
    await userEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(tracked.location.pathname).toBe('/browse'));
  });
});
