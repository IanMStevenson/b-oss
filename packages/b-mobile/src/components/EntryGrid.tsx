// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A grid of entry thumbnails, backed by b-view's ThumbnailGrid (rules.md, Lists, feeds & paging —
// real pagination, no fixed page cap: every server page fetched via usePagedResource accumulates
// into one array, then ThumbnailGrid windows it client-side into pages sized to fit the screen,
// the same way b-view-backup's local journal browser does). ThumbnailGrid has no hook of its own
// for "the user is nearing the end of what's currently loaded" — it only ever sees a fixed array —
// so this wrapper keeps calling the host's onLoadMore in the background whenever hasMore is true,
// re-triggering as each page lands, until the host reports nothing more to fetch. By the time a
// user pages far enough to need it, the next server page has usually already arrived.
// usePagedResource's own loadMore() already no-ops while a fetch is in flight or hasMore is
// false, so calling it opportunistically here is safe, not just convenient.
//
// A hidden member's entries render as b-view's own "couldn't load" placeholder tile — no
// thumbnail, no title (rules.md, Hiding: what suppression means) — via a resolveAsset that
// deliberately rejects for the sentinel thumbnail_path substituted in below, rather than ever
// calling platform/imageCache.ts for it. The tile stays tappable: the entry still opens on SCR-06,
// which shows its own "you've hidden this member" state with Unhide, per rules.md's "opening a
// hidden member's entry deliberately" rule.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { IonRefresher, IonRefresherContent } from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/core';
import { ThumbnailGrid } from '@b-oss/b-view';
import type { EntryIndex } from '@b-oss/b-view';
import { resolveImage } from '../platform/imageCache.js';
import { useHiddenMembers } from '../state/hiddenMembersStore.js';

const HIDDEN_THUMBNAIL = '__hidden__';

interface EntryGridProps {
  entries: EntryIndex[];
  onSelectEntry: (entryId: string) => void;
  hasMore: boolean;
  onLoadMore: () => void;
  onRefresh: () => void;
}

export function EntryGrid({
  entries,
  onSelectEntry,
  hasMore,
  onLoadMore,
  onRefresh,
}: EntryGridProps) {
  const hiddenMembers = useHiddenMembers();
  const [sizePercent, setSizePercent] = useState(100);

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

  useEffect(() => {
    if (hasMore) onLoadMore();
    // Re-run whenever a new page lands (entries.length grows) or hasMore first becomes true —
    // deliberately not depending on onLoadMore's own identity, which usePagedResource recreates
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, entries.length]);

  function handleRefresh(event: CustomEvent<RefresherEventDetail>): void {
    onRefresh();
    event.detail.complete();
  }

  return (
    <>
      <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
        <IonRefresherContent />
      </IonRefresher>
      <div style={{ height: '100%' }}>
        <ThumbnailGrid
          entries={displayEntries}
          selectedEntryId={null}
          onSelectEntry={onSelectEntry}
          sizePercent={sizePercent}
          onSizeChange={setSizePercent}
          resolveAsset={resolveAsset}
        />
      </div>
    </>
  );
}
