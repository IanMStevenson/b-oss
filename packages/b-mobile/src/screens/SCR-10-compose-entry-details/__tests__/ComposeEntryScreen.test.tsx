// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ComposeEntryScreen } from '../ComposeEntryScreen.js';
import { useComposeDraftStore } from '../../../state/composeDraftStore.js';
import type { ComposeDraft } from '../../../state/composeDraftStore.js';

const { fetchDayEligibility, fetchMonthEligibility } = vi.hoisted(() => ({
  fetchDayEligibility: vi.fn(),
  fetchMonthEligibility: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../../data/journal.js', () => ({ fetchDayEligibility, fetchMonthEligibility }));

const { fetchUserProfile } = vi.hoisted(() => ({ fetchUserProfile: vi.fn() }));
vi.mock('../../../data/users.js', () => ({ fetchUserProfile }));

const { enqueueDraft } = vi.hoisted(() => ({ enqueueDraft: vi.fn() }));
vi.mock('../../../flows/composeFlow.js', () => ({ enqueueDraft }));

// react-easy-crop is rendering-heavy (canvas/pointer gesture handling) and irrelevant to this
// screen's own logic under test — mocked wholesale, same "mock at the boundary" principle
// MapScreen's tests apply to maplibre-gl.
vi.mock('../../../components/PhotoCropper.js', () => ({
  PhotoCropper: () => <div data-testid="photo-cropper" />,
}));

const push = vi.fn();
const replace = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push, replace, goBack: vi.fn() }),
}));

function baseDraft(overrides: Partial<ComposeDraft> = {}): ComposeDraft {
  return {
    mode: 'publish',
    accountId: 'a1',
    photo: {
      webPath: 'blob:photo',
      mimeType: 'image/jpeg',
      width: 800,
      height: 600,
      createdAt: null,
      sizeBytes: null,
    },
    title: '',
    tags: '',
    description: '',
    date: '2026-01-15',
    location: null,
    displayLocation: false,
    thumbnailCrop: null,
    dirty: false,
    ...overrides,
  };
}

beforeEach(() => {
  fetchUserProfile.mockResolvedValue({
    user: {},
    details: { member: 0 },
    visible: true,
    friendship: null,
    latestEntry: null,
  });
  fetchDayEligibility.mockResolvedValue({
    publishable: true,
    message: null,
    existingEntryId: null,
  });
  fetchMonthEligibility.mockResolvedValue({});
  useComposeDraftStore.setState({ draft: baseDraft() });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <ComposeEntryScreen />
    </MemoryRouter>,
  );
}

describe('ComposeEntryScreen', () => {
  it('redirects to SCR-09 when there is no active publish draft', async () => {
    useComposeDraftStore.setState({ draft: null });
    renderScreen();
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/compose'));
  });

  it('enables Upload once the date is confirmed eligible, and enqueues on tap', async () => {
    renderScreen();
    await waitFor(() =>
      expect(screen.getByText('Upload').closest('ion-button')!.hasAttribute('disabled')).toBe(
        false,
      ),
    );

    enqueueDraft.mockResolvedValue('q1');
    await userEvent.click(screen.getByText('Upload'));
    await waitFor(() => expect(enqueueDraft).toHaveBeenCalled());
    expect(useComposeDraftStore.getState().draft).toBeNull();
    expect(replace).toHaveBeenCalledWith('/uploads');
  });

  it('blocks Upload and shows the reason for an ineligible date, with a jump-to-entry affordance', async () => {
    fetchDayEligibility.mockResolvedValue({
      publishable: false,
      message: 'You already have an entry for that day.',
      existingEntryId: 'e9',
    });
    renderScreen();
    expect(await screen.findByText('You already have an entry for that day.')).toBeDefined();
    expect(screen.getByText('Upload').closest('ion-button')!.hasAttribute('disabled')).toBe(true);

    await userEvent.click(screen.getByText('View that entry'));
    expect(push).toHaveBeenCalledWith('/entry/e9');
  });

  it('shows an unusable-photo message and offers to choose another, blocking Upload entirely', async () => {
    useComposeDraftStore.setState({
      draft: baseDraft({
        photo: {
          webPath: 'x',
          mimeType: 'image/gif',
          width: 10,
          height: 10,
          createdAt: null,
          sizeBytes: null,
        },
      }),
    });
    renderScreen();
    expect(await screen.findByText(/isn.t supported/)).toBeDefined();
    expect(screen.getByText('Upload').closest('ion-button')!.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Choose another photo')).toBeDefined();
  });

  it('offers the crop button only to members', async () => {
    fetchUserProfile.mockResolvedValue({
      user: {},
      details: { member: 1 },
      visible: true,
      friendship: null,
      latestEntry: null,
    });
    renderScreen();
    expect(await screen.findByText('Crop')).toBeDefined();
  });

  it('does not offer the crop button to non-members', async () => {
    renderScreen();
    await waitFor(() => expect(fetchUserProfile).toHaveBeenCalled());
    expect(screen.queryByText('Crop')).toBeNull();
  });

  it('navigating to add a location without one first pushes to the location picker', () => {
    renderScreen();
    const checkbox = screen.getByText('Add location').closest('ion-checkbox')!;
    checkbox.dispatchEvent(
      new CustomEvent('ionChange', { bubbles: true, detail: { checked: true } }),
    );
    expect(push).toHaveBeenCalledWith('/compose/location');
  });
});
