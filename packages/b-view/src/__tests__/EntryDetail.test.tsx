// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { EntryDetail, formatAperture } from '../components/EntryDetail.js';
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

  describe('top bar and photo frame (b-oss#169/#170)', () => {
    it('shows the date tile and nav strip, not the old chevron row with a long-date heading', () => {
      render(
        <EntryDetail
          entryState={loadedState(makeEntry({ date: '2026-01-15' }))}
          prevEntryId="0"
          nextEntryId="2"
          onNavigate={() => {}}
        />,
      );
      expect(screen.getByText('15th')).toBeDefined();
      expect(screen.getByText('Jan, 26')).toBeDefined();
      expect(screen.getByLabelText('Older entry')).toBeDefined();
      expect(screen.queryByText(/15th January 2026/)).toBeNull();
    });

    it('renders the host header slot opposite the strip', () => {
      render(
        <EntryDetail
          entryState={loadedState(makeEntry())}
          prevEntryId={null}
          nextEntryId={null}
          onNavigate={() => {}}
          header={<div>author block</div>}
        />,
      );
      expect(screen.getByText('author block')).toBeDefined();
    });

    it('offers the popup calendar from the entries it was given (the viewer)', () => {
      render(
        <EntryDetail
          entryState={loadedState(makeEntry())}
          prevEntryId={null}
          nextEntryId={null}
          onNavigate={() => {}}
          entries={[
            { entry_id: '1', date: '2026-01-15', title: 't', thumbnail_path: 'p', json_path: 'j' },
          ]}
        />,
      );
      expect(screen.getByLabelText('Jump to date')).toBeDefined();
    });

    it('is full-width by default and caps the height only when asked', () => {
      const props = {
        entryState: loadedState(makeEntry()),
        prevEntryId: null,
        nextEntryId: null,
        onNavigate: () => {},
        baseUrl: '/b',
      };
      const { container, rerender } = render(<EntryDetail {...props} />);
      const img = () => container.querySelector(`.${styles.photoInner} img`);
      return waitFor(() => expect(img()).not.toBeNull()).then(() => {
        expect(img()!.className).not.toContain(styles.photoCapped);
        rerender(<EntryDetail {...props} photoFit="capped" />);
        expect(img()!.className).toContain(styles.photoCapped);
      });
    });
  });

  describe('content block (b-oss#171)', () => {
    const base = {
      prevEntryId: null,
      nextEntryId: null,
      onNavigate: () => {},
    };

    it('shows the owner pill (edit | delete) only for the segments the host allows', () => {
      const onEdit = vi.fn();
      const onDelete = vi.fn();
      const { rerender } = render(
        <EntryDetail
          {...base}
          entryState={loadedState(makeEntry())}
          ownerActions={{ onEdit, onDelete }}
        />,
      );
      fireEvent.click(screen.getByLabelText('Edit entry'));
      fireEvent.click(screen.getByLabelText('Delete entry'));
      expect(onEdit).toHaveBeenCalledTimes(1);
      expect(onDelete).toHaveBeenCalledTimes(1);

      rerender(
        <EntryDetail {...base} entryState={loadedState(makeEntry())} ownerActions={{ onEdit }} />,
      );
      expect(screen.getByLabelText('Edit entry')).toBeDefined();
      expect(screen.queryByLabelText('Delete entry')).toBeNull();

      rerender(<EntryDetail {...base} entryState={loadedState(makeEntry())} />);
      expect(screen.queryByLabelText('Edit entry')).toBeNull();
    });

    it('shows a Download segment only when the host supplies onDownload', () => {
      const onDownload = vi.fn();
      const { rerender } = render(
        <EntryDetail
          {...base}
          entryState={loadedState(makeEntry())}
          ownerActions={{ onDownload }}
        />,
      );
      fireEvent.click(screen.getByLabelText('Download photo'));
      expect(onDownload).toHaveBeenCalledTimes(1);
      expect(screen.queryByLabelText('Edit entry')).toBeNull();

      rerender(
        <EntryDetail
          {...base}
          entryState={loadedState(makeEntry())}
          ownerActions={{ onEdit: vi.fn() }}
        />,
      );
      expect(screen.queryByLabelText('Download photo')).toBeNull();
    });

    it('keeps the stars/hearts pill when there are no views to show', () => {
      render(
        <EntryDetail
          {...base}
          entryState={loadedState(makeEntry({ views_total: 0, stars_total: 7 }))}
        />,
      );
      expect(screen.queryByText('views')).toBeNull();
      expect(screen.getByText('7')).toBeDefined();
      expect(screen.getByLabelText('View photo full-screen')).toBeDefined();
    });

    it('uses Blipfoto order: description, then stats, with comments last', () => {
      const { container } = render(
        <EntryDetail
          {...base}
          entryState={loadedState(makeEntry({ views_total: 61, tags: ['saw'] }))}
          commentComposer={<div>composer</div>}
        />,
      );
      const position = (el: Element) => Array.from(container.querySelectorAll('*')).indexOf(el);
      const title = screen.getByText('A day at the harbour');
      const views = screen.getByText('views');
      const tag = screen.getByText('saw');
      const comments = screen.getByText(/Comments \(/);
      expect(position(title)).toBeLessThan(position(views));
      expect(position(views)).toBeLessThan(position(tag));
      expect(position(tag)).toBeLessThan(position(comments));
    });

    it('offers the location as a pill: a host handler, else an external maps link', () => {
      const onLocationClick = vi.fn();
      const entry = makeEntry({ location: { lat: 55.9, lon: -3.2 } });
      const { rerender } = render(
        <EntryDetail {...base} entryState={loadedState(entry)} onLocationClick={onLocationClick} />,
      );
      fireEvent.click(screen.getByLabelText('View on map'));
      expect(onLocationClick).toHaveBeenCalledWith({ lat: 55.9, lon: -3.2 });

      rerender(<EntryDetail {...base} entryState={loadedState(entry)} />);
      expect(screen.getByLabelText('View on map').getAttribute('href')).toContain(
        'maps.google.com/maps?q=55.9,-3.2',
      );
    });

    it('renders tags as chips, tappable only when the host handles them', () => {
      const onTagClick = vi.fn();
      const entry = makeEntry({ tags: ['saw', 'macro'] });
      const { rerender } = render(
        <EntryDetail {...base} entryState={loadedState(entry)} onTagClick={onTagClick} />,
      );
      fireEvent.click(screen.getByLabelText('Entries tagged macro'));
      expect(onTagClick).toHaveBeenCalledWith('macro');
      rerender(<EntryDetail {...base} entryState={loadedState(entry)} />);
      expect(screen.queryByLabelText('Entries tagged macro')).toBeNull();
      expect(screen.getByText('macro')).toBeDefined();
    });
  });

  describe('comment slots (b-oss#172)', () => {
    const withComments = () =>
      makeEntry({
        comments: [
          {
            comment_id: 'c1',
            parent_id: null,
            commenter_username: 'alice',
            content: 'First!',
            content_html: '<p>First!</p>',
            replies: [
              {
                comment_id: 'c2',
                parent_id: 'c1',
                commenter_username: 'bob',
                content: 'A reply',
                content_html: '<p>A reply</p>',
                replies: [],
              },
            ],
          },
        ],
      });
    const base = { prevEntryId: null, nextEntryId: null, onNavigate: () => {} };

    it('shows "Comments (0)" with the composer even when there are no comments yet', () => {
      render(
        <EntryDetail
          {...base}
          entryState={loadedState(makeEntry({ comments: [] }))}
          commentComposer={<div>composer</div>}
        />,
      );
      expect(screen.getByText('Comments (0)')).toBeDefined();
      expect(screen.getByText('composer')).toBeDefined();
    });

    it('renders an editor in place of a comment (body and actions hidden), top-level or reply', () => {
      render(
        <EntryDetail
          {...base}
          entryState={loadedState(withComments())}
          renderCommentActions={() => <span>actions</span>}
          renderCommentEditor={(c) => (c.comment_id === 'c2' ? <div>editing bob</div> : null)}
        />,
      );
      expect(screen.getByText('editing bob')).toBeDefined();
      expect(screen.queryByText('A reply')).toBeNull(); // replaced by the editor
      expect(screen.getByText('First!')).toBeDefined(); // the other comment is untouched
      expect(screen.getAllByText('actions')).toHaveLength(1); // alice's only; bob's are hidden
    });

    it('renders a reply composer beneath its comment, above that comment’s own replies', () => {
      const { container } = render(
        <EntryDetail
          {...base}
          entryState={loadedState(withComments())}
          renderCommentReply={(c) => (c.comment_id === 'c1' ? <div>reply box</div> : null)}
        />,
      );
      const position = (el: Element) => Array.from(container.querySelectorAll('*')).indexOf(el);
      expect(position(screen.getByText('First!'))).toBeLessThan(
        position(screen.getByText('reply box')),
      );
      expect(position(screen.getByText('reply box'))).toBeLessThan(
        position(screen.getByText('A reply')),
      );
    });
  });

  describe('comment rendering (Blipfoto style)', () => {
    const base = { prevEntryId: null, nextEntryId: null, onNavigate: () => {} };
    const comment = (over: Record<string, unknown> = {}) => ({
      comment_id: 'c1',
      parent_id: null,
      commenter_username: 'alice',
      content: 'First!',
      content_html: '',
      replies: [],
      ...over,
    });
    const entryWith = (comments: ReturnType<typeof comment>[]) =>
      loadedState(makeEntry({ comments }));

    it('puts the composer above the list of comments', () => {
      const { container } = render(
        <EntryDetail
          {...base}
          entryState={entryWith([comment()])}
          commentComposer={<div>composer</div>}
        />,
      );
      const position = (el: Element) => Array.from(container.querySelectorAll('*')).indexOf(el);
      expect(position(screen.getByText('Comments (1)'))).toBeLessThan(
        position(screen.getByText('composer')),
      );
      expect(position(screen.getByText('composer'))).toBeLessThan(
        position(screen.getByText('First!')),
      );
    });

    it('shows an avatar column only when the host supplies avatars', () => {
      const { container, rerender } = render(
        <EntryDetail {...base} entryState={entryWith([comment()])} />,
      );
      expect(container.querySelector('img[src*="alice.jpg"]')).toBeNull();
      expect(container.querySelector(`.${styles.commentAvatar}`)).toBeNull(); // viewer: no column

      rerender(
        <EntryDetail
          {...base}
          entryState={entryWith([comment({ commenter_avatar: 'https://cdn.example/alice.jpg' })])}
        />,
      );
      expect(container.querySelector('img[src="https://cdn.example/alice.jpg"]')).not.toBeNull();

      rerender(
        <EntryDetail {...base} entryState={entryWith([comment({ commenter_avatar: '' })])} />,
      );
      expect(container.querySelector(`.${styles.commentAvatar}`)).not.toBeNull(); // placeholder keeps the column
      expect(container.querySelector(`.${styles.commentAvatar} img`)).toBeNull();
    });

    it('makes the commenter a link only when the host handles it', () => {
      const onUserClick = vi.fn();
      const { rerender } = render(
        <EntryDetail {...base} entryState={entryWith([comment()])} onUserClick={onUserClick} />,
      );
      fireEvent.click(screen.getByText('alice'));
      expect(onUserClick).toHaveBeenCalledWith('alice');

      rerender(<EntryDetail {...base} entryState={entryWith([comment()])} />);
      expect(screen.getByText('alice').tagName).toBe('SPAN');
    });

    it('renders host badges beside the name, on replies too', () => {
      render(
        <EntryDetail
          {...base}
          entryState={entryWith([
            comment({
              replies: [comment({ comment_id: 'c2', commenter_username: 'bob', content: 'Re' })],
            }),
          ])}
          renderCommenterBadges={(c) => <span>badge-{c.commenter_username}</span>}
        />,
      );
      expect(screen.getByText('badge-alice')).toBeDefined();
      expect(screen.getByText('badge-bob')).toBeDefined();
    });
  });

  describe('main photo that will not draw (b-oss#185)', () => {
    const props = {
      prevEntryId: null,
      nextEntryId: null,
      onNavigate: () => {},
    };

    it('drops the cached copy and refetches once, then leaves it alone', async () => {
      const resolveAsset = vi.fn((path: string) => Promise.resolve(`resolved://${path}`));
      const invalidateAsset = vi.fn().mockResolvedValue(undefined);
      const entry = makeEntry({ images: { image: 'photo.jpg' } });
      const { container } = render(
        <EntryDetail
          {...props}
          entryState={loadedState(entry)}
          resolveAsset={resolveAsset}
          invalidateAsset={invalidateAsset}
        />,
      );
      const img = () => container.querySelector(`.${styles.photoInner} img`) as HTMLElement;
      await waitFor(() => expect(img()).not.toBeNull());
      const before = resolveAsset.mock.calls.length; // (the lightbox preloader resolves it too)

      fireEvent.error(img());
      await waitFor(() => expect(invalidateAsset).toHaveBeenCalledWith('photo.jpg'));
      await waitFor(() => expect(resolveAsset.mock.calls.length).toBeGreaterThan(before));
      await waitFor(() => expect(img()).not.toBeNull());
      const afterRetry = resolveAsset.mock.calls.length;

      fireEvent.error(img()); // fails again: no further automatic attempts
      await new Promise((r) => setTimeout(r, 0));
      expect(resolveAsset.mock.calls.length).toBe(afterRetry);
      expect(invalidateAsset).toHaveBeenCalledTimes(1);
    });

    it('does nothing for a host with no async resolver', () => {
      const invalidateAsset = vi.fn();
      const entry = makeEntry({ images: { image: 'photo.jpg' } });
      const { container } = render(
        <EntryDetail
          {...props}
          entryState={loadedState(entry)}
          baseUrl="/b"
          invalidateAsset={invalidateAsset}
        />,
      );
      fireEvent.error(container.querySelector(`.${styles.photoInner} img`)!);
      expect(invalidateAsset).not.toHaveBeenCalled();
    });
  });

  describe('swipe between entries', () => {
    function swipe(el: Element, dx: number, dy = 0) {
      fireEvent.touchStart(el, { touches: [{ clientX: 200, clientY: 300 }] });
      fireEvent.touchEnd(el, { changedTouches: [{ clientX: 200 + dx, clientY: 300 + dy }] });
    }
    function renderWithNav(
      onNavigate = vi.fn(),
      next: string | null = '2',
      prev: string | null = '0',
    ) {
      const utils = render(
        <EntryDetail
          entryState={loadedState(makeEntry())}
          prevEntryId={prev}
          nextEntryId={next}
          onNavigate={onNavigate}
          commentComposer={<textarea aria-label="new comment" />}
        />,
      );
      return { ...utils, onNavigate };
    }

    it('follows the arrows: swipe right goes ▶ (newer), swipe left goes ◀ (older)', () => {
      const { container, onNavigate } = renderWithNav();
      const photo = container.querySelector(`.${styles.photoInner}`)!;
      swipe(photo, 120);
      expect(onNavigate).toHaveBeenLastCalledWith('2');
      swipe(photo, -120);
      expect(onNavigate).toHaveBeenLastCalledWith('0');
    });

    it('works anywhere on the page, not just the photo (e.g. over the description)', () => {
      const { onNavigate } = renderWithNav();
      swipe(screen.getByText(/Second paragraph/), 120);
      expect(onNavigate).toHaveBeenCalledWith('2');
    });

    it('does nothing at either end of the journal', () => {
      const { onNavigate } = renderWithNav(vi.fn(), null, null);
      swipe(screen.getByText(/Second paragraph/), 120);
      swipe(screen.getByText(/Second paragraph/), -120);
      expect(onNavigate).not.toHaveBeenCalled();
    });

    it('ignores a mostly-vertical drag (scrolling) and a short one', () => {
      const { onNavigate } = renderWithNav();
      swipe(screen.getByText(/Second paragraph/), 60, 200);
      swipe(screen.getByText(/Second paragraph/), 20);
      expect(onNavigate).not.toHaveBeenCalled();
    });

    it('ignores a touch that starts in the comment box (text editing, not paging)', () => {
      const { onNavigate } = renderWithNav();
      swipe(screen.getByLabelText('new comment'), 120);
      expect(onNavigate).not.toHaveBeenCalled();
    });

    it('does not also navigate the entry underneath while the lightbox is open', async () => {
      const { container, onNavigate } = renderWithNav();
      fireEvent.click(screen.getByLabelText('View photo full-screen'));
      await waitFor(() => expect(container.querySelector('[role="dialog"]')).not.toBeNull());
      swipe(container.querySelector('[role="dialog"]')!, 120);
      expect(onNavigate).not.toHaveBeenCalled();
    });
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

describe('formatAperture', () => {
  it('shows "f/4" for both the API form ("f/4") and a bare number, never "f/f/4"', () => {
    expect(formatAperture('f/4')).toBe('f/4');
    expect(formatAperture('F/2.8')).toBe('F/2.8');
    expect(formatAperture('4')).toBe('f/4');
  });

  it('is null for no value', () => {
    expect(formatAperture(null)).toBeNull();
    expect(formatAperture('')).toBeNull();
  });
});
