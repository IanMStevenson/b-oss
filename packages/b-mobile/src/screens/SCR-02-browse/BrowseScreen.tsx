// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-02 — Browse. The seven feeds (Recent, Following, Me, Popular, Milestones, New Blippers,
// Nearby) are in-screen tab state, not routes (§5). Only the active tab is mounted: choosing a
// tab starts it fresh at page 1 (see handleTabChange), while Back from an entry restores the tab
// and page you left via data/resumeCache.ts (BEHAVIOUR.md, Screens).

import { Images, MapPin } from 'lucide-react';
import { EmptyState } from '../../components/EmptyState.js';
import { useEffect, useState } from 'react';
import { resumeClear, resumeGet, resumeSet } from '../../data/resumeCache.js';
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
import { usePagedResource } from '../../data/usePagedResource.js';
import {
  fetchRecentPage,
  fetchPopularPage,
  fetchNewBlippersPage,
  fetchMilestonesPage,
  fetchFollowingPage,
  fetchJustMePage,
  fetchNearbyPage,
  PAGE_SIZE,
  JOURNAL_PAGE_SIZE,
} from '../../data/entries.js';
import { fetchUserProfile } from '../../data/users.js';
import type { Page } from '../../data/usePagedResource.js';
import { ScrollEdgeHint } from '../../components/ScrollEdgeHint.js';
import { EntryGrid } from '../../components/EntryGrid.js';
import { useActiveAccount } from '../../state/accountsStore.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { getCurrentPosition } from '../../platform/geolocation.js';
import type { EntryIndex } from '@b-oss/b-view';

type Tab = 'recent' | 'following' | 'justme' | 'popular' | 'milestones' | 'new' | 'nearby';

// Recent is a fixed 900 entries: the on-device depth probe (b-oss#196) found its last page holds
// the 900th entry whether paged at 100 or 30 (the website's own 50 pages x 18). Popular is *not*
// fixed — the same probe measured 327 entries, below the website's nominal 20 x 18 = 360 — so it
// has no hard-coded total and the pager grows as pages load, like Following. Entry counts, not
// page counts, are the portable fact: ThumbnailGrid derives its own totalPages from this at
// whatever page size the current zoom/margins produce.
const RECENT_TOTAL_ENTRIES = 50 * 18;

function NearbyTab() {
  const navigate = useAppNavigate();
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const [asked, setAsked] = useState(false);

  // A `null` resolution (permission granted, no fix available) is folded into the same
  // "can't show this tab" state as a rejection (permission refused) — Phase 6 made
  // getCurrentPosition() real, and both cases need the same treatment here or a device with
  // no GPS fix but granted permission would spin forever instead of showing the message.
  // Also the "Allow location" button's handler: it re-runs the same permission flow.
  function locate(): void {
    setLocationDenied(false);
    getCurrentPosition().then(
      (result) => (result ? setCoords(result) : setLocationDenied(true)),
      () => setLocationDenied(true),
    );
  }

  useEffect(locate, []);

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
      <>
        {locationDenied ? (
          <>
            <EmptyState
              icon={<MapPin size={40} strokeWidth={1.5} />}
              title="Nearby needs your location."
              hint={
                asked ? 'If nothing happens, allow location in your phone settings.' : undefined
              }
            />
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <IonButton
                onClick={() => {
                  setAsked(true);
                  locate();
                }}
              >
                Allow location
              </IonButton>
            </div>
          </>
        ) : (
          <div className="ion-padding" style={{ display: 'flex', justifyContent: 'center' }}>
            <IonSpinner />
          </div>
        )}
      </>
    );
  }

  return <ResourceGrid resource={resource} onSelectEntry={(id) => navigate.push(`/entry/${id}`)} />;
}

function ResourceGrid({
  resource,
  onSelectEntry,
  totalEntryCount,
  resumeKey,
  showCalendar,
  overlayContent,
}: {
  resource: ReturnType<typeof usePagedResource<EntryIndex>>;
  onSelectEntry: (entryId: string) => void;
  totalEntryCount?: number;
  /** Remembers the grid's page so Back from an entry lands on it (b-oss#182). */
  resumeKey?: string;
  /** Journal views only (the Me tab) — see EntryGrid's showCalendar. */
  showCalendar?: boolean;
  /** `'date-title'` for a single journal's grid (the Me tab); omitted = journal name (b-oss#259). */
  overlayContent?: 'date-title' | 'journal';
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
    return <EmptyState icon={<Images size={40} strokeWidth={1.5} />} title="Nothing here yet." />;
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
      resumeKey={resumeKey}
      showCalendar={showCalendar}
      overlayContent={overlayContent}
    />
  );
}

function FeedTab({
  fetchPage,
  totalEntryCount,
  resumeKey,
}: {
  fetchPage: (pageIndex: number) => Promise<Page<EntryIndex>>;
  totalEntryCount?: number;
  resumeKey: string;
}) {
  const navigate = useAppNavigate();
  const resource = usePagedResource(fetchPage, [], PAGE_SIZE, resumeKey);
  return (
    <ResourceGrid
      resource={resource}
      onSelectEntry={(id) => navigate.push(`/entry/${id}`)}
      totalEntryCount={totalEntryCount}
      resumeKey={resumeKey}
    />
  );
}

// entry_total is a real, exact count (BlipUserDetails, already used by the Profile screen) —
// fetched once per visit to this tab, not part of the paged feed's own response (b-oss#144).
function JustMeTab({ resumeKey }: { resumeKey: string }) {
  const navigate = useAppNavigate();
  const resource = usePagedResource(fetchJustMePage, [], JOURNAL_PAGE_SIZE, resumeKey);
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
      resumeKey={resumeKey}
      showCalendar
      overlayContent="date-title"
    />
  );
}

interface BrowseUiState {
  tab: Tab;
}

export function BrowseScreen() {
  const activeAccount = useActiveAccount();
  // Everything remembered about this screen is scoped to the account: Following / Me are
  // per-account feeds, and a different account must never inherit another's.
  const scope = activeAccount?.id ?? 'anon';
  const uiKey = `browse:${scope}:ui`;
  const feedKey = (t: Tab) => `browse:${scope}:feed:${t}`;

  // Back from an entry rebuilds this screen (see data/resumeCache.ts) — restore the tab you were
  // on, instead of resetting to Recent (b-oss#182).
  const [tab, setTab] = useState<Tab>(() => {
    const saved = resumeGet<BrowseUiState>(uiKey);
    const available = (t: Tab) => activeAccount !== null || (t !== 'following' && t !== 'justme');
    return saved && available(saved.tab) ? saved.tab : 'recent';
  });

  // Choosing a tab always starts it at page 1: only the active tab is mounted, and its remembered
  // page is dropped here. Coming Back from an entry doesn't pass through this, so that still lands
  // on the page you left (b-oss#204).
  function handleTabChange(next: Tab): void {
    if (next === tab) return;
    resumeClear(feedKey(next));
    setTab(next);
    resumeSet<BrowseUiState>(uiKey, { tab: next });
  }

  return (
    <IonPage>
      <IonHeader>
        <AppHeader title="Browse" />
        <IonToolbar>
          <ScrollEdgeHint>
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
              <IonSegmentButton value="milestones">
                <IonLabel>Milestones</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton value="new">
                <IonLabel>New Blippers</IonLabel>
              </IonSegmentButton>
              <IonSegmentButton value="nearby">
                <IonLabel>Nearby</IonLabel>
              </IonSegmentButton>
            </IonSegment>
          </ScrollEdgeHint>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {/* Keyed by account as well as tab, so switching account rebuilds the feed — Following and
            Me are per-account and must not keep showing the previous account's entries. */}
        <div key={`${scope}:${tab}`} style={{ height: '100%' }}>
          {tab === 'recent' && (
            <FeedTab
              fetchPage={fetchRecentPage}
              totalEntryCount={RECENT_TOTAL_ENTRIES}
              resumeKey={feedKey('recent')}
            />
          )}
          {tab === 'popular' && (
            <FeedTab fetchPage={fetchPopularPage} resumeKey={feedKey('popular')} />
          )}
          {tab === 'following' && (
            <FeedTab fetchPage={fetchFollowingPage} resumeKey={feedKey('following')} />
          )}
          {tab === 'justme' && <JustMeTab resumeKey={feedKey('justme')} />}
          {tab === 'milestones' && (
            <FeedTab fetchPage={fetchMilestonesPage} resumeKey={feedKey('milestones')} />
          )}
          {tab === 'new' && <FeedTab fetchPage={fetchNewBlippersPage} resumeKey={feedKey('new')} />}
          {tab === 'nearby' && <NearbyTab />}
        </div>
      </IonContent>
    </IonPage>
  );
}
