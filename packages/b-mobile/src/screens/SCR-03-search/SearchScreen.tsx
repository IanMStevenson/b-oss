// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-03 — Search (FLW-04). Two in-screen tabs, same "stay mounted once visited" pattern
// BrowseScreen uses for its five feeds (rules.md: "switching back to a tab loaded earlier in the
// same visit doesn't force a re-query" applies to SCR-03 too). Entries reuses EntryGrid/
// usePagedResource exactly like every other feed; People is new territory but `users/search`
// returns the same BlipUser shape the paged-people-list screens already use, so it reuses UserRow
// directly (checked in data/users.ts's fetchSearchUsersPage doc comment).
//
// The query text is a plain native <input type="search"> in a <form>, not IonSearchbar — same
// reasoning as SCR-15's plain <textarea>: this needs a real onSubmit for the keyboard's search
// action (dismissing the keyboard and searching immediately, bypassing the debounce), which is
// simpler to get right with a native form element than reaching through Ionic's shadow DOM.
//
// Each tab tracks its own "committed" term, synced from the shared (debounced-or-submitted) term
// only while that tab is the active one — an inactive, still-mounted tab does not refetch merely
// because the term changed elsewhere, which is what makes "switch tabs -> search the new tab for
// the current term if it has no results yet" (FLW-04) come out right without a second in-flight
// request racing the visible tab's.

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
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
  IonRefresher,
  IonRefresherContent,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
} from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/core';
import { AccountIndicator } from '../../components/AccountIndicator.js';
import { usePagedResource } from '../../data/usePagedResource.js';
import { useDebouncedValue } from '../../data/useDebounce.js';
import { fetchSearchEntriesPage } from '../../data/entries.js';
import { fetchSearchUsersPage } from '../../data/users.js';
import { EntryGrid } from '../../components/EntryGrid.js';
import { UserRow } from '../../components/UserRow.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import type { EntryIndex } from '@b-oss/b-view';
import type { BlipUser } from '@b-oss/b-api';

type Tab = 'entries' | 'people';

const DEBOUNCE_MS = 400;

function IdlePrompt() {
  return (
    <div className="ion-padding">
      <p>Search entries and people.</p>
    </div>
  );
}

function EntriesTab({
  term,
  active,
  onSelectEntry,
}: {
  term: string;
  active: boolean;
  onSelectEntry: (entryId: string) => void;
}) {
  const [committedTerm, setCommittedTerm] = useState(term);
  useEffect(() => {
    if (active) setCommittedTerm(term);
  }, [active, term]);
  const trimmed = committedTerm.trim();

  const resource = usePagedResource<EntryIndex>(
    (pageIndex) =>
      trimmed
        ? fetchSearchEntriesPage(trimmed, pageIndex)
        : Promise.resolve({ items: [], more: false }),
    [trimmed],
  );

  if (!trimmed) return <IdlePrompt />;
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
        <p>No results for &lsquo;{trimmed}&rsquo;.</p>
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

function PeopleTab({
  term,
  active,
  onSelectUser,
}: {
  term: string;
  active: boolean;
  onSelectUser: (username: string) => void;
}) {
  const [committedTerm, setCommittedTerm] = useState(term);
  useEffect(() => {
    if (active) setCommittedTerm(term);
  }, [active, term]);
  const trimmed = committedTerm.trim();

  const resource = usePagedResource<BlipUser>(
    (pageIndex) =>
      trimmed
        ? fetchSearchUsersPage(trimmed, pageIndex)
        : Promise.resolve({ items: [], more: false }),
    [trimmed],
  );

  function handleRefresh(event: CustomEvent<RefresherEventDetail>): void {
    resource.refresh();
    event.detail.complete();
  }

  function handleInfinite(event: Event): void {
    resource.loadMore();
    void (event.target as HTMLIonInfiniteScrollElement).complete();
  }

  if (!trimmed) return <IdlePrompt />;
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
        <p>No results for &lsquo;{trimmed}&rsquo;.</p>
      </div>
    );
  }
  return (
    <>
      <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
        <IonRefresherContent />
      </IonRefresher>
      {resource.items.map((user) => (
        <UserRow key={user.username} user={user} onTap={() => onSelectUser(user.username)} />
      ))}
      <IonInfiniteScroll disabled={!resource.hasMore} onIonInfinite={handleInfinite}>
        <IonInfiniteScrollContent />
      </IonInfiniteScroll>
    </>
  );
}

export function SearchScreen() {
  const navigate = useAppNavigate();
  const [tab, setTab] = useState<Tab>('entries');
  const [visited, setVisited] = useState<Set<Tab>>(new Set(['entries']));
  const [inputValue, setInputValue] = useState('');
  // Set on Enter/submit to bypass the debounce; cleared on the next keystroke so typing resumes
  // the normal debounced path. `term` prefers this over the debounced value whenever it's set.
  const [submittedValue, setSubmittedValue] = useState<string | null>(null);
  const debouncedValue = useDebouncedValue(inputValue, DEBOUNCE_MS);
  const term = submittedValue ?? debouncedValue;

  function handleInputChange(value: string): void {
    setInputValue(value);
    setSubmittedValue(null);
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    setSubmittedValue(inputValue);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }

  function handleClear(): void {
    setInputValue('');
    setSubmittedValue(null);
  }

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
          <IonTitle>Search</IonTitle>
          <IonButtons slot="end">
            <AccountIndicator />
          </IonButtons>
        </IonToolbar>
        <IonToolbar>
          <form
            onSubmit={handleSubmit}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}
          >
            <input
              type="search"
              enterKeyHint="search"
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="Search…"
              aria-label="Search"
              style={{ flex: 1, font: 'inherit', padding: 8, minWidth: 0 }}
            />
            {inputValue.length > 0 && (
              <IonButton fill="clear" type="button" onClick={handleClear} aria-label="Clear search">
                Clear
              </IonButton>
            )}
          </form>
        </IonToolbar>
        <IonToolbar>
          <IonSegment value={tab} onIonChange={(e) => handleTabChange(e.detail.value as Tab)}>
            <IonSegmentButton value="entries">
              <IonLabel>Entries</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="people">
              <IonLabel>People</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {[...visited].map((t) => (
          <div key={t} hidden={t !== tab} style={{ height: '100%' }}>
            {t === 'entries' && (
              <EntriesTab
                term={term}
                active={tab === 'entries'}
                onSelectEntry={(id) => navigate.push(`/entry/${id}`)}
              />
            )}
            {t === 'people' && (
              <PeopleTab
                term={term}
                active={tab === 'people'}
                onSelectUser={(username) => navigate.push(`/user/${encodeURIComponent(username)}`)}
              />
            )}
          </div>
        ))}
      </IonContent>
    </IonPage>
  );
}
