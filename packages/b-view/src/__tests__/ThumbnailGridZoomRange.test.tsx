// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// Regression: with a small base tile on a wide window the width-derived minimum zoom exceeded the
// 200% maximum, so the control could only switch between 200% and the minimum (e.g. 223%)
// (b-oss#635, seen on the first Windows run of b-mobile-pc: 86px base, a wide window).

import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ThumbnailGrid } from '../components/ThumbnailGrid.js';
import type { EntryIndex } from '../types.js';

let stageWidth = 3000;
let stageHeight = 800;
class MeasuredResizeObserver {
  constructor(private readonly cb: (entries: { contentRect: { width: number; height: number } }[]) => void) {}
  observe() {
    this.cb([{ contentRect: { width: stageWidth, height: stageHeight } }]);
  }
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MeasuredResizeObserver;
});

afterEach(cleanup);

const entries: EntryIndex[] = Array.from({ length: 4 }, (_, i) => ({
  entry_id: String(i + 1),
  date: `2026-01-0${i + 1}`,
  title: `Entry ${i + 1}`,
  thumbnail_path: `thumb-${i + 1}.jpg`,
  json_path: `entry-${i + 1}.json`,
}));

function setup(start: number, baseTileSize: number, minZoomFromWidth?: boolean) {
  const onSizeChange = vi.fn();
  render(
    <ThumbnailGrid
      entries={entries}
      selectedEntryId={null}
      onSelectEntry={() => {}}
      sizePercent={start}
      onSizeChange={onSizeChange}
      baseTileSize={baseTileSize}
      minZoomFromWidth={minZoomFromWidth}
    />,
  );
  return onSizeChange;
}

describe('ThumbnailGrid zoom range on a wide window', () => {
  it('zoom out from the maximum moves (86px base, 3000px wide: width-derived minimum is above 200%)', () => {
    stageWidth = 3000;
    const onSizeChange = setup(200, 86);
    fireEvent.click(screen.getByLabelText('Zoom out'));
    expect(onSizeChange).toHaveBeenCalledTimes(1);
    expect(onSizeChange.mock.calls[0][0]).toBeLessThan(200);
  });

  it('zoom in below the maximum moves up and never past 200%', () => {
    stageWidth = 3000;
    const onSizeChange = setup(195, 86);
    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(onSizeChange).toHaveBeenCalledWith(200);
  });

  it('from a stored value above the maximum, zoom out steps down and zoom in comes back to 200', () => {
    stageWidth = 3000;
    const out = setup(223, 86);
    fireEvent.click(screen.getByLabelText('Zoom out'));
    expect(out.mock.calls[0][0]).toBeLessThan(223);
    cleanup();
    const inn = setup(223, 86);
    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(inn).toHaveBeenCalledWith(200);
  });

  it('a normal window keeps its width-derived minimum (156px base, 1200px landscape: 96%)', () => {
    stageWidth = 1200;
    const onSizeChange = setup(100, 156);
    fireEvent.click(screen.getByLabelText('Zoom out'));
    expect(onSizeChange).toHaveBeenCalledWith(96);
  });

  it('without the width-derived floor, zoom out from 100% goes smaller, not bigger (desktop, 156px base, 2600px wide)', () => {
    stageWidth = 2600;
    const onSizeChange = setup(100, 156, false);
    fireEvent.click(screen.getByLabelText('Zoom out'));
    expect(onSizeChange).toHaveBeenCalledWith(90);
    cleanup();
    // the same window with the floor on shows the jump the option exists to avoid
    const withFloor = setup(100, 156, true);
    fireEvent.click(screen.getByLabelText('Zoom out'));
    expect(withFloor.mock.calls[0][0]).toBeGreaterThan(100);
  });
});
