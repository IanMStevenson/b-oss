// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { EntryAuthorBlock } from '../EntryAuthorBlock.js';

vi.mock('../../platform/imageCache.js', () => ({
  resolveImage: (src: string) => Promise.resolve(src),
}));

afterEach(cleanup);

function setup(overrides: Partial<React.ComponentProps<typeof EntryAuthorBlock>> = {}) {
  const props = {
    username: 'cyclops',
    journalTitle: 'Cyclops Journal',
    avatarUrl: null,
    follow: null,
    onFollow: vi.fn(),
    onUnfollow: vi.fn(),
    onOpenProfile: vi.fn(),
    ...overrides,
  };
  return { ...render(<EntryAuthorBlock {...props} />), props };
}

describe('EntryAuthorBlock', () => {
  it('shows the journal title with "By <user>" beneath', () => {
    setup();
    expect(screen.getByText('Cyclops Journal')).toBeDefined();
    expect(screen.getByText('By cyclops')).toBeDefined();
  });

  it('falls back to the username when the journal has no title', () => {
    setup({ journalTitle: '   ' });
    expect(screen.getAllByText('cyclops').length).toBeGreaterThan(0);
  });

  it('shows the avatar when there is one, an initial when there is not', async () => {
    const { container, unmount } = setup({ avatarUrl: 'https://cdn.example/a.jpg' });
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    unmount();

    setup({ avatarUrl: null });
    expect(screen.getByText('c')).toBeDefined(); // the initial, uppercased by CSS
    expect(document.querySelector('img')).toBeNull();
  });

  it('opens the profile from the avatar and from the name', () => {
    const { props } = setup();
    fireEvent.click(screen.getByLabelText('cyclops’s profile'));
    fireEvent.click(screen.getByText('Cyclops Journal'));
    expect(props.onOpenProfile).toHaveBeenCalledTimes(2);
  });

  it('renders no follow control when none is offered (own entry, read-only)', () => {
    setup({ follow: null });
    expect(screen.queryByLabelText(/Follow|Following/)).toBeNull();
  });

  it('follow: a tappable icon that calls onFollow', () => {
    const { props } = setup({ follow: 'follow' });
    fireEvent.click(screen.getByLabelText('Follow cyclops'));
    expect(props.onFollow).toHaveBeenCalledTimes(1);
    expect(props.onUnfollow).not.toHaveBeenCalled();
  });

  it('following: a tappable icon that asks to unfollow (the screen confirms)', () => {
    const { props } = setup({ follow: 'following' });
    fireEvent.click(screen.getByLabelText('Following cyclops — unfollow'));
    expect(props.onUnfollow).toHaveBeenCalledTimes(1);
    expect(props.onFollow).not.toHaveBeenCalled();
  });

  it('requested: an inert icon, not a button', () => {
    const { props } = setup({ follow: 'requested' });
    const icon = screen.getByLabelText('Follow request sent');
    expect(icon.tagName).not.toBe('BUTTON');
    fireEvent.click(icon);
    expect(props.onFollow).not.toHaveBeenCalled();
    expect(props.onUnfollow).not.toHaveBeenCalled();
  });
});
