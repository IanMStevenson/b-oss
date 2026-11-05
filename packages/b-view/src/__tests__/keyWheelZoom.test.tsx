// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// Ctrl+wheel and Ctrl +/-/0 drive the grid's own zoom when a host opts in (b-oss#635).

import { describe, it, expect, afterEach, beforeAll, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ThumbnailGrid } from '../components/ThumbnailGrid.js';
import { zoomKeyCommand } from '../useKeyWheelZoom.js';
import { stepZoom, zoomLimits } from '../zoomLimits.js';
import type { EntryIndex } from '../types.js';

class MeasuredResizeObserver {
  constructor(private readonly cb: (e: { contentRect: { width: number; height: number } }[]) => void) {}
  observe() {
    this.cb([{ contentRect: { width: 1200, height: 800 } }]);
  }
  unobserve() {}
  disconnect() {}
}
beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = MeasuredResizeObserver;
});
afterEach(cleanup);

const entries: EntryIndex[] = [1, 2, 3, 4].map((n) => ({
  entry_id: String(n),
  date: `2026-01-0${n}`,
  title: `Entry ${n}`,
  thumbnail_path: `t${n}.jpg`,
  json_path: `e${n}.json`,
}));

function setup(keyboardWheelZoom: boolean | undefined, sizePercent = 100) {
  const onSizeChange = vi.fn();
  const { container } = render(
    <ThumbnailGrid
      entries={entries}
      selectedEntryId={null}
      onSelectEntry={() => {}}
      sizePercent={sizePercent}
      onSizeChange={onSizeChange}
      baseTileSize={156}
      keyboardWheelZoom={keyboardWheelZoom}
    />,
  );
  return { onSizeChange, container };
}

const key = (k: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { key: k, ctrlKey: true, bubbles: true, cancelable: true, ...init });

describe('zoomKeyCommand', () => {
  const base = { ctrlKey: true, metaKey: false, altKey: false };
  it('maps Ctrl + = / + / - / 0 (numpad reports the same keys)', () => {
    expect(zoomKeyCommand({ ...base, key: '+' })).toBe('in');
    expect(zoomKeyCommand({ ...base, key: '=' })).toBe('in');
    expect(zoomKeyCommand({ ...base, key: '-' })).toBe('out');
    expect(zoomKeyCommand({ ...base, key: '_' })).toBe('out');
    expect(zoomKeyCommand({ ...base, key: '0' })).toBe('reset');
  });
  it('needs Ctrl or Cmd, ignores Alt combinations and other keys', () => {
    expect(zoomKeyCommand({ ...base, ctrlKey: false, key: '+' })).toBeNull();
    expect(zoomKeyCommand({ ...base, ctrlKey: false, metaKey: true, key: '+' })).toBe('in');
    expect(zoomKeyCommand({ ...base, altKey: true, key: '+' })).toBeNull();
    expect(zoomKeyCommand({ ...base, key: 'a' })).toBeNull();
  });
});

describe('zoom limits and steps', () => {
  it('derived minimum is capped one step under the maximum', () => {
    expect(zoomLimits(3000, 8, 86)).toEqual({ min: 190, max: 200 });
    expect(zoomLimits(1200, 8, 156)).toEqual({ min: 96, max: 200 });
    expect(zoomLimits(0, 8, 156)).toEqual({ min: 30, max: 200 });
  });
  it('steps stay inside the limits', () => {
    const l = { min: 96, max: 200 };
    expect(stepZoom(100, -1, l)).toBe(96);
    expect(stepZoom(195, 1, l)).toBe(200);
    expect(stepZoom(150, 1, l)).toBe(160);
  });
});

describe('ThumbnailGrid keyboardWheelZoom', () => {
  it('Ctrl+wheel up zooms in, down zooms out, and the wheel event is cancelled', () => {
    const { onSizeChange, container } = setup(true);
    const grid = container.firstElementChild!;
    const up = new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true });
    grid.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);
    expect(onSizeChange).toHaveBeenLastCalledWith(110);
    grid.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: 100, bubbles: true, cancelable: true }));
    expect(onSizeChange).toHaveBeenLastCalledWith(96);
  });

  it('a plain wheel scroll is left alone', () => {
    const { onSizeChange, container } = setup(true);
    const plain = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    container.firstElementChild!.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false);
    expect(onSizeChange).not.toHaveBeenCalled();
  });

  it('Ctrl+ + - 0 zoom in, out and reset, and are cancelled', () => {
    const { onSizeChange } = setup(true, 150);
    const plus = key('+');
    window.dispatchEvent(plus);
    expect(plus.defaultPrevented).toBe(true);
    expect(onSizeChange).toHaveBeenLastCalledWith(160);
    window.dispatchEvent(key('-'));
    expect(onSizeChange).toHaveBeenLastCalledWith(140);
    window.dispatchEvent(key('0'));
    expect(onSizeChange).toHaveBeenLastCalledWith(100);
  });

  it('does nothing unless the host opts in (a plain browser keeps its page zoom)', () => {
    const { onSizeChange, container } = setup(undefined);
    const plus = key('+');
    window.dispatchEvent(plus);
    const wheel = new WheelEvent('wheel', { ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true });
    container.firstElementChild!.dispatchEvent(wheel);
    expect(plus.defaultPrevented).toBe(false);
    expect(wheel.defaultPrevented).toBe(false);
    expect(onSizeChange).not.toHaveBeenCalled();
  });

  it('ignores the keys while its page is hidden behind another (Ionic keeps it mounted)', () => {
    const { onSizeChange, container } = setup(true);
    const page = document.createElement('div');
    page.className = 'ion-page-hidden';
    document.body.appendChild(page);
    page.appendChild(container);
    const plus = key('+');
    window.dispatchEvent(plus);
    expect(plus.defaultPrevented).toBe(false);
    expect(onSizeChange).not.toHaveBeenCalled();
    page.remove();
  });

  it('stops listening after unmount', () => {
    const { onSizeChange } = setup(true);
    cleanup();
    window.dispatchEvent(key('+'));
    expect(onSizeChange).not.toHaveBeenCalled();
  });
});

