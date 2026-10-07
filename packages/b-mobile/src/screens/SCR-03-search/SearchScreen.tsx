// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-03 — Search (FLW-04). Two in-screen tabs; only the active one is mounted, and choosing a tab
// starts it fresh at page 1 (device feedback 2026-10-05, same rule as Browse and Profile — this
// supersedes rules.md's earlier "switching back to a tab loaded earlier doesn't re-query"). Entries reuses EntryGrid/
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
import { AppHeader } from '../../components/AppHeader.js';
import { usePagedResource } from '../../data/usePagedResource.js';
import { resumeClear, resumeGet, resumeSet } from '../../data/resumeCache.js';
import { useActiveAccount } from '../../state/accountsStore.js';
import { useDebouncedValue } from '../../data/useDebounce.js';
import { fetchSearchEntriesPage, PAGE_SIZE } from '../../data/entries.js';
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
  scope,
  onSelectEntry,
}: {
  term: string;
  active: boolean;
  /** The signed-in account (or 'anon'), so results and pages remembered for Back are never shared
   * between accounts. */
  scope: string;
  onSelectEntry: (entryId: string) => void;
}) {
  // A tab that isn't showing doesn't search until it is (a restored hidden tab included).
  const [committedTerm, setCommittedTerm] = useState(active ? term : '');
  useEffect(() => {
    if (active) setCommittedTerm(term);
  }, [active, term]);
  const trimmed = committedTerm.trim();

  // Back from an entry returns to this search's results on the page you were on (b-oss#190).
  const resumeKey = `search:${scope}:entries:${trimmed}`;
  const resource = usePagedResource<EntryIndex>(
    (pageIndex) =>
      trimmed
        ? fetchSearchEntriesPage(trimmed, pageIndex)
        : Promise.resolve({ items: [], more: false }),
    [trimmed],
    PAGE_SIZE,
    resumeKey,
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
      resumeKey={resumeKey}
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
  scope,
  onSelectUser,
}: {
  term: string;
  active: boolean;
  scope: string;
  onSelectUser: (username: string) => void;
}) {
  // A tab that isn't showing doesn't search until it is (a restored hidden tab included).
  const [committedTerm, setCommittedTerm] = useState(active ? term : '');
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
    30,
    `search:${scope}:people:${trimmed}`,
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

interface SearchUi {
  tab: Tab;
  input: string;
  submitted: string | null;
}

export function SearchScreen() {
  const navigate = useAppNavigate();
  const activeAccount = useActiveAccount();
  const scope = activeAccount?.id ?? 'anon';
  const uiKey = `search:${scope}:ui`;
  // Opening a result unmounts this screen (data/resumeCache.ts), so Back would otherwise return to
  // an empty search box on the Entries tab. Restore what was typed, the tab, and (via the tabs'
  // own resume keys) the results and page (b-oss#190).
  const [saved] = useState(() => resumeGet<SearchUi>(uiKey));
  const [tab, setTab] = useState<Tab>(saved?.tab ?? 'entries');
  const [inputValue, setInputValue] = useState(saved?.input ?? '');
  // Set on Enter/submit to bypass the debounce; cleared on the next keystroke so typing resumes
  // the normal debounced path. `term` prefers this over the debounced value whenever it's set.
  const [submittedValue, setSubmittedValue] = useState<string | null>(saved?.submitted ?? null);
  const debouncedValue = useDebouncedValue(inputValue, DEBOUNCE_MS);
  const term = submittedValue ?? debouncedValue;

  useEffect(() => {
    resumeSet<SearchUi>(uiKey, { tab, input: inputValue, submitted: submittedValue });
  }, [uiKey, tab, inputValue, submittedValue]);

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

  // Choosing a tab starts it at page 1: only the active tab is mounted and its remembered results
  // page is dropped here. Back from an entry doesn't pass through this (b-oss#204).
  function handleTabChange(next: Tab): void {
    if (next === tab) return;
    resumeClear(`search:${scope}:${next}:`);
    setTab(next);
  }

  return (
    <IonPage>
      <IonHeader>
        <AppHeader title="Search" />
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
        <div key={`${scope}:${tab}`} style={{ height: '100%' }}>
          {tab === 'entries' && (
            <EntriesTab
              term={term}
              scope={scope}
              active
              onSelectEntry={(id) => navigate.push(`/entry/${id}`)}
            />
          )}
          {tab === 'people' && (
            <PeopleTab
              term={term}
              scope={scope}
              active
              onSelectUser={(username) => navigate.push(`/user/${encodeURIComponent(username)}`)}
            />
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}
