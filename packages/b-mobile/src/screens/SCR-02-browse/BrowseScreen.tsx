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
  IonTitle,
  IonButtons,
  IonMenuButton,
  IonButton,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonContent,
  IonSpinner,
  IonText,
} from '@ionic/react';
import { usePagedResource } from '../../data/usePagedResource.js';
import {
  fetchRecentPage,
  fetchPopularPage,
  fetchFollowingPage,
  fetchJustMePage,
  fetchNearbyPage,
} from '../../data/entries.js';
import type { Page } from '../../data/usePagedResource.js';
import { EntryGrid } from '../../components/EntryGrid.js';
import { useActiveAccount } from '../../state/accountsStore.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { getCurrentPosition } from '../../platform/geolocation.js';
import type { EntryIndex } from '@b-oss/b-view';

type Tab = 'recent' | 'following' | 'justme' | 'popular' | 'nearby';

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
}: {
  resource: ReturnType<typeof usePagedResource<EntryIndex>>;
  onSelectEntry: (entryId: string) => void;
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
    />
  );
}

function FeedTab({ fetchPage }: { fetchPage: (pageIndex: number) => Promise<Page<EntryIndex>> }) {
  const navigate = useAppNavigate();
  const resource = usePagedResource(fetchPage, []);
  return <ResourceGrid resource={resource} onSelectEntry={(id) => navigate.push(`/entry/${id}`)} />;
}

export function BrowseScreen() {
  const [tab, setTab] = useState<Tab>('recent');
  const [visited, setVisited] = useState<Set<Tab>>(new Set(['recent']));
  const activeAccount = useActiveAccount();
  const navigate = useAppNavigate();

  function handleTabChange(next: Tab): void {
    setTab(next);
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonMenuButton />
          </IonButtons>
          <IonTitle>Browse</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={() => navigate.push('/search')}>Search</IonButton>
          </IonButtons>
        </IonToolbar>
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
                <IonLabel>Just Me</IonLabel>
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
            {t === 'recent' && <FeedTab fetchPage={fetchRecentPage} />}
            {t === 'popular' && <FeedTab fetchPage={fetchPopularPage} />}
            {t === 'following' && <FeedTab fetchPage={fetchFollowingPage} />}
            {t === 'justme' && <FeedTab fetchPage={fetchJustMePage} />}
            {t === 'nearby' && <NearbyTab />}
          </div>
        ))}
      </IonContent>
    </IonPage>
  );
}
