// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
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

function makeEntries(count: number, startAt = 1): EntryIndex[] {
  return Array.from({ length: count }, (_, i) => ({
    entry_id: String(startAt + i),
    date: `2026-01-${String(startAt + i).padStart(2, '0')}`,
    title: `Entry ${startAt + i}`,
    thumbnail_path: `thumb-${startAt + i}.jpg`,
    json_path: `entry-${startAt + i}.json`,
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

describe('ThumbnailGrid totalEntryCount (b-oss#144)', () => {
  // Fallback pageSize is 2x2 = 4 when unmeasured (see the ResizeObserver stub comment above).
  it('uses totalEntryCount for the displayed total when it is bigger than what has loaded', () => {
    render(
      <ThumbnailGrid
        entries={makeEntries(4)}
        selectedEntryId={null}
        onSelectEntry={() => {}}
        totalEntryCount={40}
      />,
    );
    // 40 entries at pageSize 4 = 10 pages; the fixed-cell Pagination row always includes the
    // last page number, so it appearing confirms totalPages picked up totalEntryCount, not just
    // entries.length (which alone would say 1 page and hide the row entirely).
    expect(screen.getByLabelText('Page 10')).toBeDefined();
  });

  it('never lets a stale totalEntryCount undercount what has actually loaded', () => {
    render(
      <ThumbnailGrid
        entries={makeEntries(20)}
        selectedEntryId={null}
        onSelectEntry={() => {}}
        totalEntryCount={4}
      />,
    );
    // 20 loaded at pageSize 4 = 5 pages, even though the (stale) known total says only 1 page's
    // worth exists.
    expect(screen.getByLabelText('Page 5')).toBeDefined();
  });

  it('falls back to entries.length when no totalEntryCount is given', () => {
    render(
      <ThumbnailGrid entries={makeEntries(8)} selectedEntryId={null} onSelectEntry={() => {}} />,
    );
    expect(screen.getByLabelText('Page 2')).toBeDefined();
    expect(screen.queryByLabelText('Page 3')).toBeNull();
  });
});

describe('ThumbnailGrid allEntriesLoaded (b-oss#146)', () => {
  // Fallback pageSize is 2x2 = 4 when unmeasured (see the ResizeObserver stub comment above).
  it('once confirmed complete, corrects a totalEntryCount guess that was too high', () => {
    render(
      <ThumbnailGrid
        entries={makeEntries(8)}
        selectedEntryId={null}
        onSelectEntry={() => {}}
        totalEntryCount={40} // a wrong guess — genuinely only 8 entries exist
        allEntriesLoaded
      />,
    );
    // 8 loaded at pageSize 4 = 2 real pages, not the 10 the wrong guess implied.
    expect(screen.getByLabelText('Page 2')).toBeDefined();
    expect(screen.queryByLabelText('Page 10')).toBeNull();
  });

  it('trusts an unconfirmed totalEntryCount guess until allEntriesLoaded says otherwise', () => {
    render(
      <ThumbnailGrid
        entries={makeEntries(8)}
        selectedEntryId={null}
        onSelectEntry={() => {}}
        totalEntryCount={40}
      />,
    );
    expect(screen.getByLabelText('Page 10')).toBeDefined();
  });

  it('shows a "nothing more" message, not a blank grid, when there is genuinely nothing to show', () => {
    render(
      <ThumbnailGrid
        entries={[]}
        selectedEntryId={null}
        onSelectEntry={() => {}}
        allEntriesLoaded
      />,
    );
    expect(screen.getByText('Nothing more to show here.')).toBeDefined();
  });

  it('shows a "loading" message instead, while still waiting for more to arrive', () => {
    render(<ThumbnailGrid entries={[]} selectedEntryId={null} onSelectEntry={() => {}} />);
    expect(screen.getByText('Loading…')).toBeDefined();
  });
});

describe('ThumbnailGrid onNearEnd (b-oss#138)', () => {
  // Fallback pageSize is 2x2 = 4 when unmeasured (see the ResizeObserver stub comment above).
  it('fires when there is no more locally-loaded page ahead', () => {
    const onNearEnd = vi.fn();
    render(
      <ThumbnailGrid
        entries={makeEntries(3)}
        selectedEntryId={null}
        onSelectEntry={() => {}}
        onNearEnd={onNearEnd}
      />,
    );
    expect(onNearEnd).toHaveBeenCalledTimes(1);
  });

  it('does not fire while more locally-loaded pages remain', () => {
    const onNearEnd = vi.fn();
    render(
      <ThumbnailGrid
        entries={makeEntries(10)}
        selectedEntryId={null}
        onSelectEntry={() => {}}
        onNearEnd={onNearEnd}
      />,
    );
    expect(onNearEnd).not.toHaveBeenCalled();
  });
});

describe('ThumbnailGrid onSeek / entriesOffset / onLoadBefore (b-oss#153)', () => {
  // Fallback pageSize is 2x2 = 4 when unmeasured (see the ResizeObserver stub comment above).
  it('clicking an already-loaded distant page just repositions locally, without seeking', () => {
    const onSeek = vi.fn();
    render(
      <ThumbnailGrid
        entries={makeEntries(20)} // 5 loaded pages at pageSize 4
        selectedEntryId={null}
        onSelectEntry={() => {}}
        onSeek={onSeek}
      />,
    );
    fireEvent.click(screen.getByLabelText('Page 4')); // target index 12 — well within the 20 loaded
    expect(onSeek).not.toHaveBeenCalled();
    expect(screen.getByLabelText('2026-01-13')).toBeDefined(); // page 4 starts at entry 13
  });

  it('clicking a page beyond the loaded window calls onSeek with the absolute target, and shows a loading state until it arrives', () => {
    const onSeek = vi.fn();
    render(
      <ThumbnailGrid
        entries={makeEntries(4)} // only 1 page loaded
        selectedEntryId={null}
        onSelectEntry={() => {}}
        totalEntryCount={40} // pretends 10 pages exist, so "Page 10" is offered at all
        onSeek={onSeek}
      />,
    );
    fireEvent.click(screen.getByLabelText('Page 10')); // target index (10-1)*4 = 36, nowhere near loaded
    expect(onSeek).toHaveBeenCalledWith(36);
    // Not "Nothing more to show here." — that's reserved for allEntriesLoaded confirming this
    // page genuinely doesn't exist, which isn't the case here; this is just still in flight.
    expect(screen.getByText('Loading…')).toBeDefined();
  });

  it('once the host delivers the seeked window via entriesOffset, the target page renders for real', () => {
    const onSeek = vi.fn();
    const { rerender } = render(
      <ThumbnailGrid
        entries={makeEntries(4)}
        selectedEntryId={null}
        onSelectEntry={() => {}}
        totalEntryCount={40}
        onSeek={onSeek}
      />,
    );
    fireEvent.click(screen.getByLabelText('Page 10'));

    // The host's usePagedResource-style seekTo resolves: re-anchors the window at entry 37
    // (absolute index 36), delivering exactly the page the click targeted.
    rerender(
      <ThumbnailGrid
        entries={makeEntries(4, 37)}
        entriesOffset={36}
        selectedEntryId={null}
        onSelectEntry={() => {}}
        totalEntryCount={40}
        onSeek={onSeek}
      />,
    );
    expect(screen.getByLabelText('2026-01-37')).toBeDefined();
    expect(screen.getByLabelText('Page 10').getAttribute('aria-current')).toBe('page');
  });

  it('paging backward past the start of a seeked window calls onLoadBefore', () => {
    const onLoadBefore = vi.fn();
    render(
      <ThumbnailGrid
        entries={makeEntries(4, 37)} // window starts at absolute 36, same as the previous test
        entriesOffset={36}
        selectedEntryId={null}
        onSelectEntry={() => {}}
        totalEntryCount={40}
        onLoadBefore={onLoadBefore}
      />,
    );
    // topLeftIndex defaults to 0 on mount, which is already before entriesOffset(36) — this is
    // exactly the "not yet caught up" state a real host reaches via the same onSeek round-trip
    // the previous test exercised; from ThumbnailGrid's own perspective it's indistinguishable
    // from "the user paged backward past the window start", so the same onLoadBefore fires.
    expect(onLoadBefore).toHaveBeenCalledTimes(1);
  });

  it('"First page" seeks directly to absolute 0 rather than incrementally loading backward', () => {
    const onSeek = vi.fn();
    render(
      <ThumbnailGrid
        entries={makeEntries(4, 37)}
        entriesOffset={36}
        selectedEntryId={null}
        onSelectEntry={() => {}}
        onSizeChange={() => {}}
        onSeek={onSeek}
      />,
    );
    fireEvent.click(screen.getByLabelText('First page'));
    expect(onSeek).toHaveBeenCalledWith(0);
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
