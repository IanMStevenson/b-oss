// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A grid of entry thumbnails with pull-to-refresh and infinite scroll (rules.md, Lists, feeds &
// paging — real pagination, no fixed page cap). Deliberately not b-view's ThumbnailGrid: that
// component's own pagination is windowed pages with Prev/Next controls (built for the backup
// viewer's fixed, already-fetched entry list), which doesn't match any b-mobile feed — every one
// of them (Browse's five tabs, Tag Entries, and later Search/profile grids) is "load more as you
// scroll," never "page 3 of 12." EntryDetail/Lightbox are still reused from b-view (SCR-06/07),
// where prev/next-between-entries is a genuinely different, compatible concept.
//
// A hidden member's entries render as a placeholder tile — no thumbnail, no title (rules.md,
// Hiding: what suppression means) — but stay tappable: the entry still opens on SCR-06, which
// shows its own "you've hidden this member" state with Unhide, per rules.md's "opening a hidden
// member's entry deliberately" rule.

import {
  IonRefresher,
  IonRefresherContent,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
} from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/core';
import { CachedImage } from './CachedImage.js';
import { useHiddenMembers } from '../state/hiddenMembersStore.js';
import styles from './EntryGrid.module.css';
import type { EntryIndex } from '@b-oss/b-view';

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

  function handleRefresh(event: CustomEvent<RefresherEventDetail>): void {
    onRefresh();
    event.detail.complete();
  }

  function handleInfinite(event: Event): void {
    onLoadMore();
    void (event.target as HTMLIonInfiniteScrollElement).complete();
  }

  return (
    <>
      <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
        <IonRefresherContent />
      </IonRefresher>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
          gap: '2px',
        }}
      >
        {entries.map((entry) => {
          const isHidden = entry.username != null && hiddenMembers.includes(entry.username);
          return (
            <button
              key={entry.entry_id}
              onClick={() => onSelectEntry(entry.entry_id)}
              aria-label={isHidden ? 'Hidden entry' : entry.title || entry.date}
              style={{
                padding: 0,
                border: 'none',
                background: 'var(--bg-alt)',
                aspectRatio: '1',
                overflow: 'hidden',
                cursor: 'pointer',
              }}
            >
              {isHidden ? (
                <div className={styles.hiddenTile} aria-hidden="true" />
              ) : (
                <CachedImage
                  src={entry.thumbnail_path}
                  alt={entry.title}
                  className={styles.thumb}
                />
              )}
            </button>
          );
        })}
      </div>

      <IonInfiniteScroll disabled={!hasMore} onIonInfinite={handleInfinite}>
        <IonInfiniteScrollContent />
      </IonInfiniteScroll>
    </>
  );
}
