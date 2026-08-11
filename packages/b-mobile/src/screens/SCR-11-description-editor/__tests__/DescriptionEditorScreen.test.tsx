// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { DescriptionEditorScreen } from '../DescriptionEditorScreen.js';
import { useComposeDraftStore } from '../../../state/composeDraftStore.js';
import type { ComposeDraft } from '../../../state/composeDraftStore.js';

const goBack = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push: vi.fn(), replace: vi.fn(), goBack }),
}));

function draft(description: string): ComposeDraft {
  return {
    mode: 'publish',
    accountId: 'a1',
    photo: null,
    title: '',
    tags: '',
    description,
    date: '2026-01-01',
    location: null,
    displayLocation: false,
    thumbnailCrop: null,
    dirty: false,
  };
}

beforeEach(() => {
  useComposeDraftStore.setState({ draft: draft('Existing text') });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <DescriptionEditorScreen />
    </MemoryRouter>,
  );
}

describe('DescriptionEditorScreen', () => {
  it('loads with the existing text seeded', () => {
    renderScreen();
    expect(screen.getByPlaceholderText<HTMLTextAreaElement>('Describe this entry…').value).toBe(
      'Existing text',
    );
  });

  it('shows all five BBCode buttons, including link (unlike SCR-15’s comment editor)', () => {
    renderScreen();
    for (const label of ['B', 'I', 'U', 'S', 'Link']) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it('a toolbar button wraps the current selection in the matching tag', async () => {
    renderScreen();
    const textarea = screen.getByPlaceholderText<HTMLTextAreaElement>('Describe this entry…');
    textarea.setSelectionRange(0, 'Existing text'.length);
    await userEvent.click(screen.getByText('B'));
    await waitFor(() => expect(textarea.value).toBe('[b]Existing text[/b]'));
  });

  it('OK commits the edited text back into the draft and returns', async () => {
    renderScreen();
    const textarea = screen.getByPlaceholderText('Describe this entry…');
    await userEvent.clear(textarea);
    await userEvent.type(textarea, 'New description');
    await userEvent.click(screen.getByText('OK'));

    expect(useComposeDraftStore.getState().draft?.description).toBe('New description');
    expect(goBack).toHaveBeenCalled();
  });

  it('confirms discard when cancelling with changes', async () => {
    renderScreen();
    await userEvent.type(screen.getByPlaceholderText('Describe this entry…'), '!');
    await userEvent.click(screen.getByLabelText('Back'));
    expect(await screen.findByText('Discard changes?')).toBeDefined();
    expect(goBack).not.toHaveBeenCalled();
  });

  it('goes straight back with no confirmation when nothing changed', async () => {
    renderScreen();
    await userEvent.click(screen.getByLabelText('Back'));
    expect(goBack).toHaveBeenCalled();
  });
});
