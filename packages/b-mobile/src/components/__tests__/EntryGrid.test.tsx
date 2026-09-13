// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EntryGrid } from '../EntryGrid.js';
import { useDevicePrefsStore } from '../../state/devicePrefsStore.js';
import type { EntryIndex } from '@b-oss/b-view';

vi.mock('../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

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
