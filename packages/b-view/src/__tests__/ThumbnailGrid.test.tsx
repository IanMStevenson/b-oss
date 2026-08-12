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

function pinch(el: Element, startDist: number, endDist: number) {
  const start = [
    { clientX: 200 - startDist / 2, clientY: 200 },
    { clientX: 200 + startDist / 2, clientY: 200 },
  ];
  const end = [
    { clientX: 200 - endDist / 2, clientY: 200 },
    { clientX: 200 + endDist / 2, clientY: 200 },
  ];
  fireEvent.touchStart(el, { touches: start });
  fireEvent.touchMove(el, { touches: end });
}

describe('ThumbnailGrid pinch-to-zoom', () => {
  it('two-finger pinch-out scales sizePercent up from the gesture start value', () => {
    const entries = makeEntries(4);
    let sizePercent = 100;
    const handleSizeChange = (n: number) => {
      sizePercent = n;
    };
    const { container } = render(
      <ThumbnailGrid
        entries={entries}
        selectedEntryId={null}
        onSelectEntry={() => {}}
        sizePercent={sizePercent}
        onSizeChange={handleSizeChange}
      />,
    );
    const scroll = container.querySelector(`.${gridStyles.scroll}`)!;
    pinch(scroll, 100, 200); // fingers move twice as far apart → ~2x
    expect(sizePercent).toBe(200); // clamped to the same 30-200% range as the zoom buttons
  });

  it('two-finger pinch-in scales sizePercent down, clamped at 30%', () => {
    const entries = makeEntries(4);
    let sizePercent = 100;
    const handleSizeChange = (n: number) => {
      sizePercent = n;
    };
    const { container } = render(
      <ThumbnailGrid
        entries={entries}
        selectedEntryId={null}
        onSelectEntry={() => {}}
        sizePercent={sizePercent}
        onSizeChange={handleSizeChange}
      />,
    );
    const scroll = container.querySelector(`.${gridStyles.scroll}`)!;
    pinch(scroll, 200, 10); // fingers move much closer together
    expect(sizePercent).toBe(30);
  });

  it('a single-finger touch never triggers zoom, and does not break swipe', () => {
    const entries = makeEntries(10);
    let sizePercent = 100;
    const handleSizeChange = (n: number) => {
      sizePercent = n;
    };
    const { container } = render(
      <ThumbnailGrid
        entries={entries}
        selectedEntryId={null}
        onSelectEntry={() => {}}
        sizePercent={sizePercent}
        onSizeChange={handleSizeChange}
      />,
    );
    const scroll = container.querySelector(`.${gridStyles.scroll}`)!;
    swipe(scroll, -100);
    expect(sizePercent).toBe(100); // unaffected by an ordinary single-finger swipe
    expect(screen.getByLabelText('2026-01-05')).toBeDefined(); // swipe still paged forward
  });

  it('does nothing when onSizeChange is not provided', () => {
    const entries = makeEntries(4);
    const { container } = render(
      <ThumbnailGrid entries={entries} selectedEntryId={null} onSelectEntry={() => {}} />,
    );
    const scroll = container.querySelector(`.${gridStyles.scroll}`)!;
    // Should not throw with no onSizeChange to call.
    expect(() => pinch(scroll, 100, 200)).not.toThrow();
  });
});

describe('ThumbnailGrid showZoomControls / showPagination', () => {
  it('shows the zoom button group by default when onSizeChange is given', () => {
    const entries = makeEntries(4);
    render(
      <ThumbnailGrid
        entries={entries}
        selectedEntryId={null}
        onSelectEntry={() => {}}
        onSizeChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Zoom in')).toBeDefined();
  });

  it('hides the zoom button group when showZoomControls is false, without hiding Home/DatePicker', () => {
    const entries = makeEntries(4);
    render(
      <ThumbnailGrid
        entries={entries}
        selectedEntryId={null}
        onSelectEntry={() => {}}
        onSizeChange={() => {}}
        showZoomControls={false}
      />,
    );
    expect(screen.queryByLabelText('Zoom in')).toBeNull();
    expect(screen.getByLabelText('First page')).toBeDefined();
  });

  it('hides the pagination row when showPagination is false, even with multiple pages', () => {
    const entries = makeEntries(10); // fallback pageSize is 4 → multiple pages
    const { container } = render(
      <ThumbnailGrid
        entries={entries}
        selectedEntryId={null}
        onSelectEntry={() => {}}
        showPagination={false}
      />,
    );
    expect(container.querySelector(`.${gridStyles.paginationRow}`)).toBeNull();
  });

  it('shows the pagination row by default with multiple pages', () => {
    const entries = makeEntries(10);
    const { container } = render(
      <ThumbnailGrid entries={entries} selectedEntryId={null} onSelectEntry={() => {}} />,
    );
    expect(container.querySelector(`.${gridStyles.paginationRow}`)).not.toBeNull();
  });
});

describe('ThumbnailGrid margins', () => {
  it('normal (default) margins render the CSS module padding with a 20%-of-tile gap', () => {
    const entries = makeEntries(4);
    const { container } = render(
      <ThumbnailGrid entries={entries} selectedEntryId={null} onSelectEntry={() => {}} />,
    );
    const grid = container.querySelector(`.${gridStyles.grid}`) as HTMLElement;
    expect(grid.style.padding).toBe('');
    expect(grid.style.gap).toBe('31px'); // 20% of the default 156px tile
  });

  it('narrow margins render a 4px gap/padding', () => {
    const entries = makeEntries(4);
    const { container } = render(
      <ThumbnailGrid
        entries={entries}
        selectedEntryId={null}
        onSelectEntry={() => {}}
        margins="narrow"
      />,
    );
    const grid = container.querySelector(`.${gridStyles.grid}`) as HTMLElement;
    expect(grid.style.padding).toBe('4px');
    expect(grid.style.gap).toBe('4px');
  });

  it('none margins render zero gap/padding', () => {
    const entries = makeEntries(4);
    const { container } = render(
      <ThumbnailGrid
        entries={entries}
        selectedEntryId={null}
        onSelectEntry={() => {}}
        margins="none"
      />,
    );
    const grid = container.querySelector(`.${gridStyles.grid}`) as HTMLElement;
    expect(grid.style.padding).toBe('0px');
    expect(grid.style.gap).toBe('0px');
  });
});
