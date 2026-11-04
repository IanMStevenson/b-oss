// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntryIndex } from '@b-oss/b-view';
import type { NavSource } from '../sourceNavStore.js';
import { sourceNavReach, useSourceNavStore } from '../sourceNavStore.js';

function entry(id: string): EntryIndex {
  return { entry_id: id, date: '2026-01-01', title: id, thumbnail_path: '', json_path: '' };
}
function entries(...ids: string[]): EntryIndex[] {
  return ids.map(entry);
}
function source(fetchPage: NavSource['fetchPage'] = vi.fn()): NavSource {
  return { label: 'Recent', detail: 'Recent', fetchPage, pageSize: 3 };
}
const store = () => useSourceNavStore.getState();

beforeEach(() => store().clear());

describe('sourceNavStore.step', () => {
  it('moves along the loaded list in both directions and records the new anchor', async () => {
    store().begin(source(), entries('a', 'b', 'c'), 0, 0, false, 'a');
    expect(await store().step(1)).toBe('b');
    expect(store().anchor?.entryId).toBe('b');
    expect(await store().step(-1)).toBe('a');
  });

  it('stops at the first item and at the true end without fetching', async () => {
    const fetchPage = vi.fn();
    store().begin(source(fetchPage), entries('a', 'b'), 0, 0, false, 'a');
    expect(await store().step(-1)).toBeNull();
    store().begin(source(fetchPage), entries('a', 'b'), 0, 0, false, 'b');
    expect(await store().step(1)).toBeNull();
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('fetches the next page past the last loaded entry', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: entries('d', 'e'), more: false });
    store().begin(source(fetchPage), entries('a', 'b', 'c'), 0, 0, true, 'c');
    expect(await store().step(1)).toBe('d');
    expect(fetchPage).toHaveBeenCalledWith(1);
    expect(store().anchor?.ids).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(store().anchor?.hasMore).toBe(false);
  });

  it('fetches the previous page when the window does not start at the first entry', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: entries('a', 'b', 'c'), more: true });
    store().begin(source(fetchPage), entries('d', 'e'), 3, 1, false, 'd');
    expect(await store().step(-1)).toBe('c');
    expect(fetchPage).toHaveBeenCalledWith(0);
    expect(store().anchor?.windowStart).toBe(0);
  });

  it('asks for the page after the last one loaded, not a page worked out from the entry count', async () => {
    // A short page that still says "more" must not make the next index fractional.
    const fetchPage = vi.fn().mockResolvedValue({ items: entries('c'), more: false, index: 5 });
    store().begin(source(fetchPage), entries('a', 'b'), 12, 4, true, 'b');
    expect(await store().step(1)).toBe('c');
    expect(fetchPage).toHaveBeenCalledWith(5);
    expect(store().anchor?.lastPageIndex).toBe(5);
  });

  it('treats a clamped (repeated) page as the end of the list', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: entries('a', 'b'), more: true, index: 4 });
    store().begin(source(fetchPage), entries('a', 'b'), 12, 4, true, 'b');
    expect(await store().step(1)).toBeNull();
    expect(store().anchor?.hasMore).toBe(false);
    expect(sourceNavReach(store().anchor!).further).toBe(false);
  });

  it('never fetches a fractional page index backwards', async () => {
    const fetchPage = vi.fn();
    store().begin(source(fetchPage), entries('d', 'e'), 4, 1, false, 'd');
    expect(await store().step(-1)).toBeNull();
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('does not duplicate entries a fetched page repeats', async () => {
    const fetchPage = vi.fn().mockResolvedValue({ items: entries('c', 'd'), more: false });
    store().begin(source(fetchPage), entries('a', 'b', 'c'), 0, 0, true, 'c');
    await store().step(1);
    expect(store().anchor?.ids).toEqual(['a', 'b', 'c', 'd']);
  });

  it('returns null and keeps the anchor when a fetch fails', async () => {
    const fetchPage = vi.fn().mockRejectedValue(new Error('offline'));
    store().begin(source(fetchPage), entries('a'), 0, 0, true, 'a');
    expect(await store().step(1)).toBeNull();
    expect(store().anchor?.entryId).toBe('a');
    expect(store().loading).toBe(false);
  });

  it('drops a fetched page if the bar was dismissed while it loaded', async () => {
    let resolve!: (p: { items: EntryIndex[]; more: boolean }) => void;
    const fetchPage = vi.fn().mockReturnValue(new Promise((r) => (resolve = r)));
    store().begin(source(fetchPage), entries('a'), 0, 0, true, 'a');
    const pending = store().step(1);
    store().clear();
    resolve({ items: entries('b'), more: false });
    expect(await pending).toBeNull();
    expect(store().anchor).toBeNull();
  });
});

describe('sourceNavReach', () => {
  it('greys out the first item (back) and the true end (further)', () => {
    store().begin(source(), entries('a', 'b'), 0, 0, false, 'a');
    expect(sourceNavReach(store().anchor!)).toEqual({ further: true, back: false });
    store().begin(source(), entries('a', 'b'), 0, 0, false, 'b');
    expect(sourceNavReach(store().anchor!)).toEqual({ further: false, back: true });
  });

  it('allows further at the last loaded entry when more exists', () => {
    store().begin(source(), entries('a', 'b'), 0, 0, true, 'b');
    expect(sourceNavReach(store().anchor!).further).toBe(true);
  });
});
