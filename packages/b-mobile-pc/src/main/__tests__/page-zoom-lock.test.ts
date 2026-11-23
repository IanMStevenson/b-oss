// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';

vi.mock('electron', () => ({
  Menu: { setApplicationMenu: vi.fn(), buildFromTemplate: vi.fn(() => ({})) },
}));
vi.mock('../app-menu.js', () => ({ appMenuTemplate: () => [] }));

import { lockPageZoom } from '../page-zoom-lock.js';

function fake(limit: () => Promise<void>) {
  const handlers = new Map<string, () => void>();
  const contents = {
    on: (e: string, h: () => void) => handlers.set(e, h),
    setZoomFactor: vi.fn(),
    setVisualZoomLevelLimits: vi.fn(limit),
  };
  return { contents, handlers };
}

describe('lockPageZoom', () => {
  it('does not touch the frame until a page has loaded', () => {
    const { contents } = fake(() => Promise.resolve());
    lockPageZoom(contents as unknown as WebContents);
    expect(contents.setVisualZoomLevelLimits).not.toHaveBeenCalled();
  });

  it('limits visual zoom and pins the factor on load', () => {
    const { contents, handlers } = fake(() => Promise.resolve());
    lockPageZoom(contents as unknown as WebContents);
    handlers.get('did-finish-load')?.();
    expect(contents.setVisualZoomLevelLimits).toHaveBeenCalledWith(1, 1);
    expect(contents.setZoomFactor).toHaveBeenCalledWith(1);
  });

  it('swallows a rejection when the frame is already gone', async () => {
    const seen: unknown[] = [];
    const onRej = (r: unknown): number => seen.push(r);
    process.on('unhandledRejection', onRej);
    const { contents, handlers } = fake(() =>
      Promise.reject(new Error('Render frame was disposed')),
    );
    lockPageZoom(contents as unknown as WebContents);
    handlers.get('did-finish-load')?.();
    await new Promise((r) => setTimeout(r, 20));
    process.off('unhandledRejection', onRej);
    expect(seen).toEqual([]);
  });
});
