// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ThumbnailGrid } from '../components/ThumbnailGrid.js';
import gridStyles from '../components/ThumbnailGrid.module.css';
import type { EntryIndex } from '../types.js';

// jsdom in this repo's version has no built-in ResizeObserver; ThumbnailGrid only uses it to
// measure its container for column/row sizing, which we don't need for these tests (unmeasured
// falls back to a fixed 2x2 = 4-per-page grid, plenty to exercise pagination/swipe).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
    ResizeObserverStub;
});

afterEach(cleanup);

function makeEntries(count: number): EntryIndex[] {
  return Array.from({ length: count }, (_, i) => ({
    entry_id: String(i + 1),
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    title: `Entry ${i + 1}`,
    thumbnail_path: `thumb-${i + 1}.jpg`,
    json_path: `entry-${i + 1}.json`,
  }));
}

function swipe(el: Element, dx: number) {
  fireEvent.touchStart(el, { touches: [{ clientX: 200, clientY: 100 }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: 200 + dx, clientY: 100 }] });
}

describe('ThumbnailGrid swipe navigation', () => {
  it('swiping left pages forward, swiping right pages back', () => {
    const entries = makeEntries(10); // fallback pageSize is 4 (2x2) when unmeasured
    const { container } = render(
      <ThumbnailGrid entries={entries} selectedEntryId={null} onSelectEntry={() => {}} />,
    );
    expect(screen.getByLabelText('2026-01-01')).toBeDefined();
    expect(screen.queryByLabelText('2026-01-05')).toBeNull();

    const scroll = container.querySelector(`.${gridStyles.scroll}`)!;
    swipe(scroll, -100); // swipe left → next page
    expect(screen.getByLabelText('2026-01-05')).toBeDefined();
    expect(screen.queryByLabelText('2026-01-01')).toBeNull();

    swipe(scroll, 100); // swipe right → back to first page
    expect(screen.getByLabelText('2026-01-01')).toBeDefined();
  });

  it('does not page past the last entry on a left swipe', () => {
    const entries = makeEntries(3); // fits on a single fallback page (4)
    const { container } = render(
      <ThumbnailGrid entries={entries} selectedEntryId={null} onSelectEntry={() => {}} />,
    );
    const scroll = container.querySelector(`.${gridStyles.scroll}`)!;
    swipe(scroll, -100);
    expect(screen.getByLabelText('2026-01-01')).toBeDefined();
  });

  it('a short horizontal drag or a mostly-vertical drag does not page', () => {
    const entries = makeEntries(10);
    const { container } = render(
      <ThumbnailGrid entries={entries} selectedEntryId={null} onSelectEntry={() => {}} />,
    );
    const scroll = container.querySelector(`.${gridStyles.scroll}`)!;
    swipe(scroll, -10); // below threshold
    expect(screen.queryByLabelText('2026-01-05')).toBeNull();

    fireEvent.touchStart(scroll, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(scroll, { changedTouches: [{ clientX: 260, clientY: 300 }] }); // mostly vertical
    expect(screen.queryByLabelText('2026-01-05')).toBeNull();
  });
});
