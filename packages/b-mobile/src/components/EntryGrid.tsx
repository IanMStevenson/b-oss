// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A grid of entry thumbnails, backed by b-view's ThumbnailGrid (rules.md, Lists, feeds & paging —
// real pagination, no fixed page cap: every server page fetched via usePagedResource accumulates
// into one array, then ThumbnailGrid windows it client-side into pages sized to fit the screen,
// the same way b-view-backup's local journal browser does). ThumbnailGrid's onNearEnd fires
// exactly when the user reaches the last currently-loaded display page — that's the one moment
// this calls the host's onLoadMore, staying one server page ahead of wherever the user actually
// is. (An earlier version of this called onLoadMore on every entries.length change instead,
// which chains: each successful fetch immediately triggered another until hasMore went false —
// on a large journal that's hundreds of sequential API calls fired back-to-back just from
// opening the screen, found live exhausting a real rate-limit allowance during testing,
// regardless of how few tiles were actually on screen. b-oss#138.)
// usePagedResource's own loadMore() already no-ops while a fetch is in flight or hasMore is
// false, so calling it from onNearEnd even when there's genuinely nothing more costs nothing.
//
// A hidden member's entries render as b-view's own "couldn't load" placeholder tile — no
// thumbnail, no title (rules.md, Hiding: what suppression means) — via a resolveAsset that
// deliberately rejects for the sentinel thumbnail_path substituted in below, rather than ever
// calling platform/imageCache.ts for it. The tile stays tappable: the entry still opens on SCR-06,
// which shows its own "you've hidden this member" state with Unhide, per rules.md's "opening a
// hidden member's entry deliberately" rule.

import { useCallback, useMemo } from 'react';
import { IonRefresher, IonRefresherContent } from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/core';
import { ThumbnailGrid } from '@b-oss/b-view';
import type { EntryIndex } from '@b-oss/b-view';
import { resolveImage } from '../platform/imageCache.js';
import { useHiddenMembers } from '../state/hiddenMembersStore.js';
import { useAppNavigate } from '../app/routes/useAppNavigate.js';
import { useDevicePrefsStore } from '../state/devicePrefsStore.js';

const HIDDEN_THUMBNAIL = '__hidden__';

// ThumbnailGrid's tile size is baseTileSize * sizePercent/100. Its own default base (156px) is
// tuned for b-view-backup's desktop viewport with its own zoom controls — at a typical ~360px
// phone width that yields only 2 columns (3 would need ~578px). 86px comfortably fits 3 across
// down to ~340px, degrading to 2 only on the narrowest phones (~320px) — still adjustable via
// the same zoom control ThumbnailGrid already exposes, and sizePercent stays at the ordinary
// 100% default rather than an odd-looking fraction, since 86px *is* this app's own "100%"
// reference size, not a discount off the desktop one.
const MOBILE_BASE_TILE_PX = 86;

interface EntryGridProps {
  entries: EntryIndex[];
  onSelectEntry: (entryId: string) => void;
  hasMore: boolean;
  onLoadMore: () => void;
  onRefresh: () => void;
  /** A real, known total for this feed, when the caller has one cheaply (b-oss#144) — see
   * ThumbnailGrid's own totalEntryCount doc comment for exactly what it does/doesn't affect.
   * Omitted: the pagination row's total keeps reflecting "how much has loaded so far", as before. */
  totalEntryCount?: number;
  /** Absolute index of `entries[0]` in the full feed — forwarded to ThumbnailGrid unchanged. See
   * usePagedResource's own `windowStart` doc comment (b-oss#153). Omitted: 0, i.e. today's
   * behaviour for a caller that never seeks. */
  entriesOffset?: number;
  /** Jumps the underlying paged resource directly to the page containing an absolute entry index
   * — wire this to `resource.seekTo` alongside `entriesOffset={resource.windowStart}` so a
   * distant pagination click (e.g. the real last page of a large journal) is a single direct
   * fetch instead of clamping to whatever's already loaded (b-oss#153). Omitted: distant clicks
   * silently clamp, same as before this existed. */
  onSeek?: (targetIndex: number) => void;
  /** Fetches the one page immediately before the current window and prepends it — wire to
   * `resource.loadBefore`, alongside the two props above. */
  onLoadBefore?: () => void;
}

export function EntryGrid({
  entries,
  onSelectEntry,
  hasMore,
  onLoadMore,
  onRefresh,
  totalEntryCount,
  entriesOffset,
  onSeek,
  onLoadBefore,
}: EntryGridProps) {
  const hiddenMembers = useHiddenMembers();
  const navigate = useAppNavigate();
  const sizePercent = useDevicePrefsStore((s) => s.thumbnailZoomPercent);
  const setSizePercent = useDevicePrefsStore((s) => s.setThumbnailZoomPercent);
  const showZoomBar = useDevicePrefsStore((s) => s.showZoomBar);
  const showPagination = useDevicePrefsStore((s) => s.showPagination);
  const thumbnailMargins = useDevicePrefsStore((s) => s.thumbnailMargins);

  const displayEntries = useMemo(
    () =>
      entries.map((entry) =>
        entry.username != null && hiddenMembers.includes(entry.username)
          ? { ...entry, title: '', thumbnail_path: HIDDEN_THUMBNAIL }
          : entry,
      ),
    [entries, hiddenMembers],
  );

  const resolveAsset = useCallback(
    (path: string) =>
      path === HIDDEN_THUMBNAIL ? Promise.reject(new Error('hidden member')) : resolveImage(path),
    [],
  );

  function handleRefresh(event: CustomEvent<RefresherEventDetail>): void {
    onRefresh();
    event.detail.complete();
  }

  return (
    <>
      <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
        <IonRefresherContent />
      </IonRefresher>
      {/* ThumbnailGrid's own .container is `flex: 1` (ThumbnailGrid.module.css) — that only
          stretches to fill available height when its parent is itself a flex container (which
          is what b-view-backup's own shell already gives it). A plain block div here left
          `flex: 1` inert, so the grid fell back to its content's natural height instead of the
          real space available — only 2 rows fit in ~225px measured, well short of the ~690px
          IonContent actually had, leaving the rest of the screen empty. */}
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <ThumbnailGrid
          entries={displayEntries}
          selectedEntryId={null}
          onSelectEntry={onSelectEntry}
          sizePercent={sizePercent}
          onSizeChange={setSizePercent}
          baseTileSize={MOBILE_BASE_TILE_PX}
          resolveAsset={resolveAsset}
          onSearchClick={() => navigate.push('/search')}
          showZoomControls={showZoomBar}
          showPagination={showPagination}
          margins={thumbnailMargins}
          onNearEnd={() => {
            if (hasMore) onLoadMore();
          }}
          totalEntryCount={totalEntryCount}
          allEntriesLoaded={!hasMore}
          entriesOffset={entriesOffset}
          onSeek={onSeek}
          onLoadBefore={onLoadBefore}
        />
      </div>
    </>
  );
}
