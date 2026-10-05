// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EntryGrid } from '../EntryGrid.js';
import { useDevicePrefsStore } from '../../state/devicePrefsStore.js';
import type { EntryIndex } from '@b-oss/b-view';

vi.mock('../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

const { resolveImage, invalidateImage } = vi.hoisted(() => ({
  resolveImage: vi.fn(),
  invalidateImage: vi.fn(),
}));
vi.mock('../../platform/imageCache.js', () => ({ resolveImage, invalidateImage }));

vi.mock('../../state/hiddenMembersStore.js', () => ({
  useHiddenMembers: () => [],
}));

function makeEntries(count: number): EntryIndex[] {
  return Array.from({ length: count }, (_, i) => ({
    entry_id: String(i + 1),
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    title: `Entry ${i + 1}`,
    thumbnail_path: `thumb-${i + 1}.jpg`,
    json_path: `entry-${i + 1}.json`,
  }));
}

beforeEach(() => {
  useDevicePrefsStore.setState({
    showZoomBar: true,
    showPagination: true,
    thumbnailMargins: 'normal',
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderGrid(entries: EntryIndex[] = makeEntries(4)) {
  return render(
    <MemoryRouter>
      <EntryGrid
        entries={entries}
        onSelectEntry={() => {}}
        hasMore={false}
        onLoadMore={() => {}}
        onRefresh={() => {}}
      />
    </MemoryRouter>,
  );
}

describe('EntryGrid — Browsing prefs wiring', () => {
  it('shows the zoom control by default (showZoomBar defaults true)', () => {
    renderGrid();
    expect(screen.getByLabelText('Zoom in')).toBeDefined();
  });

  it('hides the zoom control when showZoomBar is off', () => {
    useDevicePrefsStore.setState({ showZoomBar: false });
    renderGrid();
    expect(screen.queryByLabelText('Zoom in')).toBeNull();
  });

  it('hides the pagination row when showPagination is off, even with multiple pages', () => {
    useDevicePrefsStore.setState({ showPagination: false });
    // fallback pageSize is 2x2=4 when unmeasured (jsdom ResizeObserver stub never fires) — 10
    // entries guarantees more than one page would otherwise render.
    renderGrid(makeEntries(10));
    expect(document.querySelector('[class*="paginationRow"]')).toBeNull();
  });

  it('passes the thumbnailMargins pref straight through to the grid', () => {
    useDevicePrefsStore.setState({ thumbnailMargins: 'none' });
    const { container } = renderGrid();
    const grid = container.querySelector('[class*="grid"]') as HTMLElement;
    expect(grid.style.padding).toBe('0px');
  });
});

describe('EntryGrid — prefetch only when actually near the end (b-oss#138)', () => {
  // Fallback pageSize is 2x2=4 when unmeasured (jsdom's ResizeObserver stub never fires) — see
  // the comment on the pagination test above.
  it('does not prefetch while more locally-loaded pages remain, even though the server has more', () => {
    const onLoadMore = vi.fn();
    render(
      <MemoryRouter>
        <EntryGrid
          entries={makeEntries(10)}
          onSelectEntry={() => {}}
          hasMore={true}
          onLoadMore={onLoadMore}
          onRefresh={() => {}}
        />
      </MemoryRouter>,
    );
    // 10 entries, pageSize 4: plenty of already-loaded pages ahead of the first — the old,
    // buggy version called onLoadMore here regardless, since it only checked hasMore.
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('prefetches once reaching the last locally-loaded page, if the server has more', () => {
    const onLoadMore = vi.fn();
    render(
      <MemoryRouter>
        <EntryGrid
          entries={makeEntries(3)}
          onSelectEntry={() => {}}
          hasMore={true}
          onLoadMore={onLoadMore}
          onRefresh={() => {}}
        />
      </MemoryRouter>,
    );
    // 3 entries, pageSize 4: nothing left to page into locally — this is the moment to fetch.
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('does not call onLoadMore at the last loaded page if the server has no more', () => {
    const onLoadMore = vi.fn();
    render(
      <MemoryRouter>
        <EntryGrid
          entries={makeEntries(3)}
          onSelectEntry={() => {}}
          hasMore={false}
          onLoadMore={onLoadMore}
          onRefresh={() => {}}
        />
      </MemoryRouter>,
    );
    expect(onLoadMore).not.toHaveBeenCalled();
  });
});

describe('EntryGrid — resuming the page you were on (b-oss#182)', () => {
  function mount(resumeKey?: string, entries: EntryIndex[] = makeEntries(20), entriesOffset = 0) {
    return render(
      <MemoryRouter>
        <EntryGrid
          entries={entries}
          onSelectEntry={() => {}}
          hasMore={false}
          onLoadMore={() => {}}
          onRefresh={() => {}}
          entriesOffset={entriesOffset}
          resumeKey={resumeKey}
        />
      </MemoryRouter>,
    );
  }

  it('comes back on the page it was left on', () => {
    const first = mount('feed');
    fireEvent.click(screen.getByLabelText('Page 3'));
    expect(screen.getByLabelText('2026-01-09')).toBeDefined();
    first.unmount(); // opening an entry

    mount('feed'); // Back
    expect(screen.getByLabelText('2026-01-09')).toBeDefined();
    expect(screen.getByLabelText('Page 3').getAttribute('aria-current')).toBe('page');
  });

  it('starts at the first page without a key, or with a key that has no memory', () => {
    const first = mount('feed');
    fireEvent.click(screen.getByLabelText('Page 3'));
    first.unmount();

    const noKey = mount(undefined);
    expect(screen.getByLabelText('2026-01-01')).toBeDefined();
    noKey.unmount();
    mount('another-feed');
    expect(screen.getByLabelText('2026-01-01')).toBeDefined();
  });

  it('ignores a remembered page that lies outside the entries now loaded', () => {
    const first = mount('feed');
    fireEvent.click(screen.getByLabelText('Page 5'));
    first.unmount();

    mount('feed', makeEntries(8)); // far fewer entries loaded now: page 5 doesn't exist here
    expect(screen.getByLabelText('2026-01-01')).toBeDefined();
  });
});

describe('EntryGrid — failed thumbnails (b-oss#185)', () => {
  it('evicts a thumbnail’s cached copy when it will not draw, and refetches it', async () => {
    resolveImage.mockImplementation((path: string) => Promise.resolve(`cached://${path}`));
    invalidateImage.mockResolvedValue(undefined);
    renderGrid(makeEntries(1));

    const img = await screen.findByAltText('Entry 1');
    const before = resolveImage.mock.calls.length;
    fireEvent.error(img);
    await waitFor(() => expect(invalidateImage).toHaveBeenCalledWith('thumb-1.jpg'));
    await waitFor(() => expect(resolveImage.mock.calls.length).toBeGreaterThan(before));
  });
});
