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
