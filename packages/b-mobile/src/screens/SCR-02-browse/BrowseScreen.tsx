// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-02 — Browse. The five feeds are in-screen tab state, not routes (§5) — Recent loads on
// open, other tabs lazy-load their first page the first time they're selected, and once loaded
// stay mounted (hidden, not unmounted) so switching back doesn't re-query (rules.md: "switching
// back to a tab loaded earlier in the same visit doesn't force a re-query").

import { useEffect, useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonContent,
  IonSpinner,
  IonText,
  IonButton,
} from '@ionic/react';
import { AppHeader } from '../../components/AppHeader.js';
import { AccountIndicator } from '../../components/AccountIndicator.js';
import { usePagedResource } from '../../data/usePagedResource.js';
import {
  fetchRecentPage,
  fetchPopularPage,
  fetchFollowingPage,
  fetchJustMePage,
  fetchNearbyPage,
  PAGE_SIZE,
} from '../../data/entries.js';
import { fetchUserProfile } from '../../data/users.js';
import type { Page } from '../../data/usePagedResource.js';
import { EntryGrid } from '../../components/EntryGrid.js';
import { useActiveAccount } from '../../state/accountsStore.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { getCurrentPosition } from '../../platform/geolocation.js';
import type { EntryIndex } from '@b-oss/b-view';

type Tab = 'recent' | 'following' | 'justme' | 'popular' | 'nearby';

// Fixed depth limits Blipfoto itself enforces on these curated feeds — confirmed by the user
// directly from blipfoto.com's own pagination (50/20 pages respectively, at the website's own
// 6x3 = 18-entries-per-page grid) and independently corroborated live: requesting entries/recent
// with an oversized page_size still only returns 200 entries with more:1, consistent with a real
// total north of 200 rather than an app-side undercount (b-oss#144). Entry counts, not page
// counts, are the portable fact — ThumbnailGrid derives its own totalPages from this at whatever
// page size the current zoom/margins produce.
const RECENT_TOTAL_ENTRIES = 50 * 18;
const POPULAR_TOTAL_ENTRIES = 20 * 18;

function NearbyTab() {
  const navigate = useAppNavigate();
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);

  useEffect(() => {
    // A `null` resolution (permission granted, no fix available) is folded into the same
    // "can't show this tab" state as a rejection (permission refused) — Phase 6 made
    // getCurrentPosition() real, and both cases need the same treatment here or a device with
    // no GPS fix but granted permission would spin forever instead of showing the message.
    getCurrentPosition().then(
      (result) => (result ? setCoords(result) : setLocationDenied(true)),
      () => setLocationDenied(true),
    );
  }, []);

  const resource = usePagedResource<EntryIndex>(
    (pageIndex) =>
      coords
        ? fetchNearbyPage(pageIndex, coords)
        : Promise.resolve<Page<EntryIndex>>({ items: [], more: false }),
    [coords],
    PAGE_SIZE,
  );

  if (!coords) {
    return (
      <div className="ion-padding">
        {locationDenied ? (
          <p>This tab needs location access to show entries near you.</p>
        ) : (
          <IonSpinner />
        )}
      </div>
    );
  }

  return <ResourceGrid resource={resource} onSelectEntry={(id) => navigate.push(`/entry/${id}`)} />;
}

function ResourceGrid({
  resource,
  onSelectEntry,
  totalEntryCount,
}: {
  resource: ReturnType<typeof usePagedResource<EntryIndex>>;
  onSelectEntry: (entryId: string) => void;
  totalEntryCount?: number;
}) {
  if (resource.status === 'loading') {
    return (
      <div className="ion-padding" style={{ display: 'flex', justifyContent: 'center' }}>
        <IonSpinner />
      </div>
    );
  }
  if (resource.status === 'error') {
    return (
      <div className="ion-padding">
        <IonText color="danger">
          <p>{resource.errorMessage}</p>
        </IonText>
        <IonButton onClick={resource.refresh}>Retry</IonButton>
      </div>
    );
  }
  if (resource.status === 'empty') {
    return (
      <div className="ion-padding">
        <p>Nothing here yet.</p>
      </div>
    );
  }
  return (
    <EntryGrid
      entries={resource.items}
      onSelectEntry={onSelectEntry}
      hasMore={resource.hasMore}
      onLoadMore={resource.loadMore}
      onRefresh={resource.refresh}
      totalEntryCount={totalEntryCount}
      entriesOffset={resource.windowStart}
      onSeek={resource.seekTo}
      onLoadBefore={resource.loadBefore}
    />
  );
}

function FeedTab({
  fetchPage,
  totalEntryCount,
}: {
  fetchPage: (pageIndex: number) => Promise<Page<EntryIndex>>;
  totalEntryCount?: number;
}) {
  const navigate = useAppNavigate();
  const resource = usePagedResource(fetchPage, [], PAGE_SIZE);
  return (
    <ResourceGrid
      resource={resource}
      onSelectEntry={(id) => navigate.push(`/entry/${id}`)}
      totalEntryCount={totalEntryCount}
    />
  );
}

// entry_total is a real, exact count (BlipUserDetails, already used by the Profile screen) —
// fetched once per visit to this tab, not part of the paged feed's own response (b-oss#144).
function JustMeTab() {
  const navigate = useAppNavigate();
  const resource = usePagedResource(fetchJustMePage, [], PAGE_SIZE);
  const [totalEntryCount, setTotalEntryCount] = useState<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchUserProfile().then(
      (profile) => {
        if (!cancelled) setTotalEntryCount(profile.details?.entry_total);
      },
      () => {
        // No fixed total to show is a display-only degradation (falls back to "how much has
        // loaded so far", same as before this existed) — not worth its own error surface.
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ResourceGrid
      resource={resource}
      onSelectEntry={(id) => navigate.push(`/entry/${id}`)}
      totalEntryCount={totalEntryCount}
    />
  );
}

export function BrowseScreen() {
  const [tab, setTab] = useState<Tab>('recent');
  const [visited, setVisited] = useState<Set<Tab>>(new Set(['recent']));
  const activeAccount = useActiveAccount();

  function handleTabChange(next: Tab): void {
    setTab(next);
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  }

  return (
    <IonPage>
      <IonHeader>
        <AppHeader title="Browse" end={<AccountIndicator />} />
        <IonToolbar>
          <IonSegment
            value={tab}
            scrollable
            onIonChange={(e) => handleTabChange(e.detail.value as Tab)}
          >
            <IonSegmentButton value="recent">
              <IonLabel>Recent</IonLabel>
            </IonSegmentButton>
            {activeAccount && (
              <IonSegmentButton value="following">
                <IonLabel>Following</IonLabel>
              </IonSegmentButton>
            )}
            {activeAccount && (
              <IonSegmentButton value="justme">
                <IonLabel>Me</IonLabel>
              </IonSegmentButton>
            )}
            <IonSegmentButton value="popular">
              <IonLabel>Popular</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="nearby">
              <IonLabel>Nearby</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {[...visited].map((t) => (
          <div key={t} hidden={t !== tab} style={{ height: '100%' }}>
            {t === 'recent' && (
              <FeedTab fetchPage={fetchRecentPage} totalEntryCount={RECENT_TOTAL_ENTRIES} />
            )}
            {t === 'popular' && (
              <FeedTab fetchPage={fetchPopularPage} totalEntryCount={POPULAR_TOTAL_ENTRIES} />
            )}
            {t === 'following' && <FeedTab fetchPage={fetchFollowingPage} />}
            {t === 'justme' && <JustMeTab />}
            {t === 'nearby' && <NearbyTab />}
          </div>
        ))}
      </IonContent>
    </IonPage>
  );
}
