// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The "source list" navigation bar's memory (b-oss#819). When an entry is opened from a browse,
// search, tag or Faves grid, the grid hands over the entries it had loaded and how to fetch more;
// the entry screen then offers a bar that steps through that list instead of through the journal.
//
// One in-memory record (the "anchor"), deliberately route-agnostic: it remembers the entry the bar
// last drew on, and the bar shows whenever the entry screen is on that entry again, however the
// user got there (Back, journal prev/next, a chain of links). A source-list grid appearing clears
// it, and so does dismissing the bar. Not persisted: it is a convenience for the current visit.
//
// Direction is by list position, not by date: "further" is the next item along the grid's reading
// order, "back" is towards the first item. For a newest-first feed that matches the journal's own
// timeline convention (older to the left).

import { create } from 'zustand';
import type { EntryIndex } from '@b-oss/b-view';
import type { Page } from '../data/usePagedResource.js';

export interface NavSource {
  /** Short caption on the bar, e.g. "Search Results", "Recent", "pinetrees Faves". */
  label: string;
  /** Where you came from, for the popover: "Following", "Search: pinetrees". */
  detail: string;
  fetchPage: (pageIndex: number) => Promise<Page<EntryIndex>>;
  /** The page size `fetchPage` requests; converts a list offset to the server page index. */
  pageSize: number;
}

interface Anchor {
  source: NavSource;
  ids: string[];
  /** Absolute index of `ids[0]` in the full feed (non-zero after the grid seeked). */
  windowStart: number;
  /** More entries exist after the last loaded one. */
  hasMore: boolean;
  /** The entry the bar last drew on. */
  entryId: string;
}

interface SourceNavState {
  anchor: Anchor | null;
  /** A page fetch for the bar is in flight. */
  loading: boolean;
  /** Called by a source-list grid when an entry is opened from it. */
  begin: (
    source: NavSource,
    entries: readonly EntryIndex[],
    windowStart: number,
    hasMore: boolean,
    entryId: string,
  ) => void;
  clear: () => void;
  /**
   * Step along the list: `+1` = further along the grid's reading order, `-1` = back towards the
   * first item. Fetches another page when the loaded list runs out. Resolves to the entry id to
   * show (and records it as the new anchor), or `null` at the end of the list / on a failed fetch.
   */
  step: (direction: 1 | -1) => Promise<string | null>;
}

export const useSourceNavStore = create<SourceNavState>((set, get) => ({
  anchor: null,
  loading: false,

  begin: (source, entries, windowStart, hasMore, entryId) =>
    set({
      anchor: { source, ids: entries.map((e) => e.entry_id), windowStart, hasMore, entryId },
      loading: false,
    }),

  clear: () => set({ anchor: null, loading: false }),

  step: async (direction) => {
    const start = get().anchor;
    if (!start || get().loading) return null;
    const at = start.ids.indexOf(start.entryId);
    if (at < 0) return null;

    let target = start.ids[at + direction];
    if (target === undefined) {
      const forward = direction === 1;
      if (forward ? !start.hasMore : start.windowStart <= 0) return null;
      const pageIndex = forward
        ? (start.windowStart + start.ids.length) / start.source.pageSize
        : Math.max(0, start.windowStart / start.source.pageSize - 1);
      set({ loading: true });
      let page: Page<EntryIndex>;
      try {
        page = await start.source.fetchPage(pageIndex);
      } catch {
        set({ loading: false });
        return null;
      }
      // The bar may have been dismissed, or restarted from another grid, while we waited.
      const now = get().anchor;
      if (!now || now.source !== start.source) {
        set({ loading: false });
        return null;
      }
      const known = new Set(now.ids);
      const fresh = page.items.map((e) => e.entry_id).filter((id) => !known.has(id));
      const ids = forward ? [...now.ids, ...fresh] : [...fresh, ...now.ids];
      const windowStart = forward ? now.windowStart : Math.max(0, now.windowStart - fresh.length);
      const hasMore = forward ? page.more : now.hasMore;
      const nowAt = ids.indexOf(now.entryId);
      target = ids[nowAt + direction];
      set({
        anchor: { ...now, ids, windowStart, hasMore, entryId: target ?? now.entryId },
        loading: false,
      });
      return target ?? null;
    }

    set({ anchor: { ...start, entryId: target } });
    return target;
  },
}));

/** Whether the bar has somewhere to go in each direction from the entry it is on. */
export function sourceNavReach(anchor: Anchor): { further: boolean; back: boolean } {
  const at = anchor.ids.indexOf(anchor.entryId);
  return {
    further: at >= 0 && (at < anchor.ids.length - 1 || anchor.hasMore),
    back: at > 0 || anchor.windowStart > 0,
  };
}
