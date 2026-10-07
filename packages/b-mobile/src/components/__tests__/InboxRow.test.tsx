// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { InboxRow } from '../InboxRow.js';

vi.mock('../CachedImage.js', () => ({ CachedImage: () => null }));

afterEach(cleanup);

describe('InboxRow', () => {
  it('announces an unread row as New, and says nothing for a read one', () => {
    render(
      <>
        <InboxRow unread>first</InboxRow>
        <InboxRow>second</InboxRow>
      </>,
    );
    expect(screen.getAllByText('New')).toHaveLength(1);
    expect(screen.getByText('first').closest('[data-unread]')).not.toBeNull();
    expect(screen.getByText('second').closest('[data-unread]')).toBeNull();
  });

  it('renders the leading slot, body and actions', () => {
    render(
      <InboxRow leading={<span>lead</span>} actions={<button>Act</button>}>
        body
      </InboxRow>,
    );
    expect(screen.getByText('lead')).toBeTruthy();
    expect(screen.getByText('body')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Act' })).toBeTruthy();
  });
});
