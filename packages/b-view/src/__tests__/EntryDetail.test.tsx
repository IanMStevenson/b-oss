// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { EntryDetail } from '../components/EntryDetail.js';
import styles from '../components/EntryDetail.module.css';
import type { BlipEntry, EntryState } from '../types.js';

afterEach(cleanup);

function makeEntry(overrides: Partial<BlipEntry> = {}): BlipEntry {
  return {
    entry_id: '1',
    date: '2026-01-15',
    title: 'A day at the harbour',
    username: 'testuser',
    journal_title: 'Test Journal',
    description: 'First paragraph with [b]bold[/b].\n\nSecond paragraph.',
    description_html: '<p>First paragraph with <b>bold</b>.</p><p>Second paragraph.</p>',
    tags: [],
    location: null,
    views_total: 0,
    stars_total: 2,
    favorites_total: 1,
    comments: [
      {
        comment_id: 'c1',
        parent_id: null,
        commenter_username: 'friend1',
        content: 'Nice shot!',
        content_html: '<p>Nice shot!</p>',
        replies: [],
      },
    ],
    exif: null,
    images: { thumbnail: 'thumb.jpg', image: 'photo.jpg' },
    ...overrides,
  };
}

function loadedState(entry: BlipEntry): EntryState {
  return { status: 'loaded', data: entry };
}

describe('EntryDetail', () => {
  it('renders the description as separate paragraphs via BBCodeText, not raw HTML', () => {
    const { container } = render(
      <EntryDetail
        entryState={loadedState(makeEntry())}
        prevEntryId={null}
        nextEntryId={null}
        onNavigate={() => {}}
      />,
    );
    const paragraphs = container.querySelectorAll(`.${styles.description} p`);
    expect(paragraphs.length).toBe(2);
    expect(container.querySelector(`.${styles.description} b`)?.textContent).toBe('bold');
  });

  it('renders comments via BBCodeText', () => {
    render(
      <EntryDetail
        entryState={loadedState(makeEntry())}
        prevEntryId={null}
        nextEntryId={null}
        onNavigate={() => {}}
      />,
    );
    expect(screen.getByText('Nice shot!')).toBeDefined();
  });

  it('clicking the main photo navigates entries, and does NOT open the lightbox', () => {
    const onNavigate = vi.fn();
    const { container } = render(
      <EntryDetail
        entryState={loadedState(makeEntry())}
        prevEntryId="0"
        nextEntryId="2"
        onNavigate={onNavigate}
      />,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    const rightHalf = container.querySelector(`.${styles.photoHalfRight}`)!;
    fireEvent.click(rightHalf);
    expect(onNavigate).toHaveBeenCalledWith('2');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('the fullscreen button (not a photo tap) opens the lightbox for the main photo', async () => {
    const { container } = render(
      <EntryDetail
        entryState={loadedState(makeEntry())}
        prevEntryId={null}
        nextEntryId={null}
        onNavigate={() => {}}
      />,
    );
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    fireEvent.click(screen.getByLabelText('View photo full-screen'));
    await waitFor(() => {
      expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    });
  });

  it('stars/hearts render as static counts when reactions is omitted', () => {
    const { container } = render(
      <EntryDetail
        entryState={loadedState(makeEntry())}
        prevEntryId={null}
        nextEntryId={null}
        onNavigate={() => {}}
      />,
    );
    expect(container.querySelector('button[aria-label="Star this entry"]')).toBeNull();
  });

  it('stars/hearts become tappable buttons when reactions is provided', () => {
    const onToggleStar = vi.fn();
    const onToggleFavorite = vi.fn();
    render(
      <EntryDetail
        entryState={loadedState(makeEntry())}
        prevEntryId={null}
        nextEntryId={null}
        onNavigate={() => {}}
        reactions={{
          starred: false,
          favorited: false,
          onToggleStar,
          onToggleFavorite,
        }}
      />,
    );
    fireEvent.click(screen.getByLabelText('Star this entry'));
    expect(onToggleStar).toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Favourite this entry'));
    expect(onToggleFavorite).toHaveBeenCalled();
  });

  it('renders the commentComposer and entryActions slots when provided', () => {
    render(
      <EntryDetail
        entryState={loadedState(makeEntry())}
        prevEntryId={null}
        nextEntryId={null}
        onNavigate={() => {}}
        commentComposer={<div>compose-slot</div>}
        entryActions={<button>edit-slot</button>}
      />,
    );
    expect(screen.getByText('compose-slot')).toBeDefined();
    expect(screen.getByText('edit-slot')).toBeDefined();
  });

  it('renders per-comment actions via renderCommentActions', () => {
    render(
      <EntryDetail
        entryState={loadedState(makeEntry())}
        prevEntryId={null}
        nextEntryId={null}
        onNavigate={() => {}}
        renderCommentActions={(comment) => <button>reply-to-{comment.comment_id}</button>}
      />,
    );
    expect(screen.getByText('reply-to-c1')).toBeDefined();
  });
});
