// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// b-oss#874: Ctrl+Left/Right step the source-nav bar like its arrows.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { EntryIndex } from '@b-oss/b-view';

const replace = vi.fn();
vi.mock('../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ replace, push: vi.fn() }),
}));
vi.mock('@ionic/react', () => ({
  IonButton: () => null,
  IonModal: () => null,
  IonSpinner: () => null,
}));

import { SourceNavBar } from '../SourceNavBar.js';
import { useSourceNavStore } from '../../state/sourceNavStore.js';

const entry = (id: string): EntryIndex => ({
  entry_id: id,
  date: '2026-01-01',
  title: id,
  thumbnail_path: '',
  json_path: '',
});

beforeEach(() => {
  replace.mockReset();
  useSourceNavStore
    .getState()
    .begin(
      { label: 'Recent', detail: 'Recent', fetchPage: vi.fn(), pageSize: 3 },
      ['a', 'b', 'c'].map(entry),
      0,
      0,
      false,
      'b',
    );
});
afterEach(() => {
  cleanup();
  useSourceNavStore.getState().clear();
});

describe('SourceNavBar keyboard', () => {
  it('Ctrl+Left goes further along the list, Ctrl+Right back', async () => {
    render(<SourceNavBar />);
    fireEvent.keyDown(window, { key: 'ArrowLeft', ctrlKey: true });
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/entry/c'));
    fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true });
    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/entry/b'));
  });

  it('ignores plain arrows, and Ctrl+arrows in a text field', () => {
    render(<SourceNavBar />);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    const input = document.body.appendChild(document.createElement('input'));
    fireEvent.keyDown(input, { key: 'ArrowLeft', ctrlKey: true });
    expect(replace).not.toHaveBeenCalled();
  });

  it('does nothing while its page is hidden under another', () => {
    const page = document.body.appendChild(document.createElement('div'));
    page.className = 'ion-page-hidden';
    render(<SourceNavBar />, { container: page.appendChild(document.createElement('div')) });
    fireEvent.keyDown(window, { key: 'ArrowLeft', ctrlKey: true });
    expect(replace).not.toHaveBeenCalled();
  });
});
