// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-17 (My Profile) and SCR-18 (User Profile) share one implementation — the API itself treats
// `username: undefined` as "the active account's own" for every relevant endpoint
// (getUserProfile, entries/journal, entries/favorites), and the two screens are ~90% identical
// (header, About/Entries/Faves tabs, Followers/Following/Awards links). What differs is gated on
// `isOwn` below: the Follow/Unfollow button and Hide never apply to your own profile.
//
// Followers/Following/Awards are not in-screen tab content (unlike About/Entries/Faves) — per the
// spec they're navigation shortcuts straight to SCR-19/SCR-22, so they're plain nav buttons, not
// IonSegment tabs.
//
// TODO(Phase 5+): "Remove follower" (SCR-18's overflow, for someone who currently follows you)
// needs to know whether *they* follow *you* — getUserProfile's friendship object is viewer-
// relative (do you follow them), not the reverse, and no cheap way to get that without a separate
// call exists yet. SCR-19's Followers list already offers this correctly (the list itself
// confirms who's a follower); SCR-18 defers to it rather than guessing.

import { useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonButton,
  IonContent,
  IonSpinner,
  IonText,
  IonSegment,
  IonSegmentButton,
  IonAlert,
  IonActionSheet,
} from '@ionic/react';
import { AppHeader } from '../../components/AppHeader.js';
import { useResource } from '../../data/useResource.js';
import { usePagedResource } from '../../data/usePagedResource.js';
import {
  fetchUserProfile,
  fetchJournalEntriesFor,
  fetchFavoriteEntriesFor,
  PAGE_SIZE,
  JOURNAL_PAGE_SIZE,
} from '../../data/users.js';
import { followUser, unfollowUser } from '../../flows/reactionsFlow.js';
import { signInGated } from '../../flows/accountsFlow.js';
import { describeError, mapApiError } from '../../data/errors.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useOverlay } from '../../app/OverlayProvider.js';
import { AccountIndicator } from '../../components/AccountIndicator.js';
import { useAccountsStore, useActiveAccount } from '../../state/accountsStore.js';
import { resumeClear, resumeGet, resumeSet } from '../../data/resumeCache.js';
import { useHiddenMembersStore, useIsHidden } from '../../state/hiddenMembersStore.js';
import { CachedImage } from '../../components/CachedImage.js';
import { UserBadges } from '../../components/UserBadges.js';
import { EntryGrid } from '../../components/EntryGrid.js';
import { openUrl } from '../../platform/browser.js';
import type { Page } from '../../data/usePagedResource.js';
import { BBCodeText } from '@b-oss/b-view';
import type { EntryIndex } from '@b-oss/b-view';

interface ProfileScreenProps {
  username?: string;
}

type Tab = 'about' | 'entries' | 'faves';

function GridTab({
  fetchPage,
  refetchKey,
  onSelectEntry,
  pageSize = PAGE_SIZE,
  resumeKey,
  showCalendar,
}: {
  fetchPage: (pageIndex: number) => Promise<Page<EntryIndex>>;
  /** fetchPage is a fresh closure every render, so its own identity can't drive
   * usePagedResource's refetch — pass whatever value actually determines what it fetches
   * (effectiveUsername here) so switching accounts on /me, or navigating between two different
   * users' profiles, both correctly refetch instead of leaving the previous account's/user's
   * entries on screen. */
  refetchKey: string | undefined;
  onSelectEntry: (id: string) => void;
  /** Must match the page size `fetchPage` actually requests — seekTo() converts entry offsets to
   * API page indexes with it. */
  pageSize?: number;
  /** Remembers this tab's loaded window and grid page, so Back from an entry lands where you were
   * (b-oss#182). Must identify the account and the profile being shown. */
  resumeKey?: string;
  /** The calendar is for a journal (the Entries tab), not Favourites (b-oss#217). */
  showCalendar?: boolean;
}) {
  const resource = usePagedResource(fetchPage, [refetchKey], pageSize, resumeKey);
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
      entriesOffset={resource.windowStart}
      onSeek={resource.seekTo}
      onLoadBefore={resource.loadBefore}
      resumeKey={resumeKey}
      showCalendar={showCalendar}
    />
  );
}

export function ProfileScreen({ username }: ProfileScreenProps) {
  const navigate = useAppNavigate();
  const { showUpgradePrompt } = useOverlay();
  const activeAccount = useActiveAccount();
  const isOwn = username === undefined || username === activeAccount?.username;
  const effectiveUsername = username ?? activeAccount?.username;

  const { state, reload } = useResource(
    () => fetchUserProfile(effectiveUsername),
    [effectiveUsername],
  );
  const isHidden = useIsHidden(effectiveUsername && !isOwn ? effectiveUsername : null);

  // Back from an entry rebuilds this screen (data/resumeCache.ts), so remember which tab you were
  // on and each grid's page — scoped to the account and the profile being shown (b-oss#182).
  const resumeScope = `profile:${activeAccount?.id ?? 'anon'}:${effectiveUsername ?? ''}`;
  const [tab, setTab] = useState<Tab>(
    () => resumeGet<{ tab: Tab }>(`${resumeScope}:ui`)?.tab ?? 'about',
  );
  const [friendshipState, setFriendshipState] = useState<0 | 1 | 2 | 3 | null>(null);
  const [confirmUnfollow, setConfirmUnfollow] = useState(false);
  const [confirmHide, setConfirmHide] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const friendship =
    state.status === 'loaded' ? (friendshipState ?? state.data.friendship?.state ?? 0) : 0;

  // Choosing a tab starts its grid at page 1: only the active tab is mounted and its remembered
  // page is dropped here. Back from an entry doesn't pass through this (b-oss#204).
  function handleTabChange(next: Tab): void {
    if (next === tab) return;
    resumeClear(`${resumeScope}:${next}`);
    setTab(next);
    resumeSet(`${resumeScope}:ui`, { tab: next });
  }

  async function handleFollow(): Promise<void> {
    if (!effectiveUsername) return;
    if (!useAccountsStore.getState().activeAccountId) {
      try {
        await signInGated();
      } catch {
        return;
      }
    }
    const fresh = useAccountsStore.getState();
    const active = fresh.accounts.find((a) => a.id === fresh.activeAccountId);
    if (active?.appTokenScope !== 'read,write') {
      showUpgradePrompt();
      return;
    }
    setFriendshipState(1);
    try {
      const result = await followUser(effectiveUsername);
      setFriendshipState(result.state);
    } catch (err) {
      setFriendshipState(friendship);
      const outcome = mapApiError(err);
      setErrorMessage(describeError(outcome, 'Could not follow this member.'));
    }
  }

  async function handleUnfollow(): Promise<void> {
    if (!effectiveUsername) return;
    setConfirmUnfollow(false);
    setFriendshipState(0);
    try {
      await unfollowUser(effectiveUsername);
    } catch (err) {
      setFriendshipState(1);
      const outcome = mapApiError(err);
      setErrorMessage(describeError(outcome, 'Could not unfollow this member.'));
    }
  }

  function handleConfirmedHide(): void {
    setConfirmHide(false);
    const account = useAccountsStore.getState();
    if (!effectiveUsername || !account.activeAccountId) return;
    useHiddenMembersStore.getState().hide(account.activeAccountId, effectiveUsername);
  }

  function handleUnhide(): void {
    const account = useAccountsStore.getState();
    if (!effectiveUsername || !account.activeAccountId) return;
    useHiddenMembersStore.getState().unhide(account.activeAccountId, effectiveUsername);
  }

  return (
    <IonPage>
      <IonHeader>
        <AppHeader
          title={isOwn ? 'My profile' : `${username}'s journal`}
          variant={isOwn ? 'menu' : 'back'}
          backHref="/browse"
          end={
            <>
              {!isOwn && state.status === 'loaded' && (
                <IonButton onClick={() => setOverflowOpen(true)}>More</IonButton>
              )}
              {isOwn && <AccountIndicator />}
            </>
          }
        />
      </IonHeader>
      <IonContent>
        {state.status === 'loading' && (
          <div className="ion-padding" style={{ display: 'flex', justifyContent: 'center' }}>
            <IonSpinner />
          </div>
        )}

        {state.status === 'error' && (
          <div className="ion-padding">
            <IonText color="danger">
              <p>{state.message}</p>
            </IonText>
            <IonButton onClick={reload}>Retry</IonButton>
          </div>
        )}

        {state.status === 'loaded' && isHidden && (
          <div className="ion-padding">
            <p>{state.data.user.username}</p>
            <p>You&rsquo;ve hidden this member.</p>
            <IonButton onClick={handleUnhide}>Unhide</IonButton>
          </div>
        )}

        {state.status === 'loaded' && !isHidden && (
          <>
            <div className="ion-padding" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <CachedImage
                src={state.data.user.avatar_url}
                alt=""
                style={{ width: 64, height: 64, borderRadius: '50%' }}
              />
              <div>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {state.data.user.username}
                  <UserBadges icons={state.data.user.icons} size={18} />
                </h2>
                {state.data.details && (
                  <p style={{ margin: 0, color: 'var(--muted)' }}>
                    {state.data.details.journal_title} · {state.data.details.entry_total} entries
                  </p>
                )}
              </div>
            </div>

            {!isOwn && (
              <div className="ion-padding" style={{ paddingTop: 0 }}>
                {friendship === 1 && (
                  <IonButton fill="outline" onClick={() => setConfirmUnfollow(true)}>
                    Unfollow
                  </IonButton>
                )}
                {friendship === 2 && (
                  <IonButton fill="outline" disabled>
                    Request sent
                  </IonButton>
                )}
                {(friendship === 0 || friendship === 3) && (
                  <IonButton fill="outline" onClick={() => void handleFollow()}>
                    Follow
                  </IonButton>
                )}
              </div>
            )}

            <IonToolbar>
              <IonSegment value={tab} onIonChange={(e) => handleTabChange(e.detail.value as Tab)}>
                <IonSegmentButton value="about">About</IonSegmentButton>
                <IonSegmentButton value="entries">Entries</IonSegmentButton>
                <IonSegmentButton value="faves">Faves</IonSegmentButton>
              </IonSegment>
            </IonToolbar>

            <div className="ion-padding" style={{ display: 'flex', gap: 12 }}>
              <IonButton
                fill="clear"
                size="small"
                onClick={() =>
                  navigate.push(`/user/${encodeURIComponent(effectiveUsername!)}/followers`)
                }
              >
                Followers
              </IonButton>
              <IonButton
                fill="clear"
                size="small"
                onClick={() =>
                  navigate.push(`/user/${encodeURIComponent(effectiveUsername!)}/following`)
                }
              >
                Following
              </IonButton>
              <IonButton
                fill="clear"
                size="small"
                onClick={() =>
                  navigate.push(
                    isOwn ? '/me/awards' : `/user/${encodeURIComponent(effectiveUsername!)}/awards`,
                  )
                }
              >
                Awards
              </IonButton>
              {isOwn && state.data.details?.privacy === 1 && (
                <IonButton fill="clear" size="small" onClick={() => navigate.push('/me/requests')}>
                  Requests
                </IonButton>
              )}
            </div>

            {!state.data.visible ? (
              <div className="ion-padding">
                <p>This journal is protected.</p>
              </div>
            ) : (
              <>
                {tab === 'about' && (
                  <div className="ion-padding">
                    {state.data.details ? (
                      <BBCodeText
                        source={state.data.details.biography}
                        onLinkClick={(href) => void openUrl(href)}
                      />
                    ) : (
                      <p>No biography.</p>
                    )}
                  </div>
                )}
                {tab === 'entries' && (
                  <GridTab
                    fetchPage={(pageIndex) => fetchJournalEntriesFor(effectiveUsername, pageIndex)}
                    pageSize={JOURNAL_PAGE_SIZE}
                    resumeKey={`${resumeScope}:entries`}
                    showCalendar
                    refetchKey={effectiveUsername}
                    onSelectEntry={(id) => navigate.push(`/entry/${id}`)}
                  />
                )}
                {tab === 'faves' && (
                  <GridTab
                    fetchPage={(pageIndex) => fetchFavoriteEntriesFor(effectiveUsername, pageIndex)}
                    pageSize={JOURNAL_PAGE_SIZE}
                    resumeKey={`${resumeScope}:faves`}
                    refetchKey={effectiveUsername}
                    onSelectEntry={(id) => navigate.push(`/entry/${id}`)}
                  />
                )}
              </>
            )}
          </>
        )}
      </IonContent>

      <IonAlert
        isOpen={confirmUnfollow}
        header="Unfollow?"
        onDidDismiss={() => setConfirmUnfollow(false)}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          { text: 'Unfollow', role: 'destructive', handler: () => void handleUnfollow() },
        ]}
      />

      <IonAlert
        isOpen={confirmHide}
        header={`Hide ${effectiveUsername ?? ''}?`}
        message="You won't see their entries, comments or notifications. This doesn't stop them seeing your journal or commenting on your entries."
        onDidDismiss={() => setConfirmHide(false)}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          { text: 'Hide', role: 'destructive', handler: handleConfirmedHide },
        ]}
      />

      <IonAlert
        isOpen={!!errorMessage}
        header="Something went wrong"
        message={errorMessage ?? ''}
        onDidDismiss={() => setErrorMessage(null)}
        buttons={['OK']}
      />

      <IonActionSheet
        isOpen={overflowOpen}
        onDidDismiss={() => setOverflowOpen(false)}
        buttons={[
          {
            text: `Hide ${effectiveUsername ?? ''}`,
            role: 'destructive',
            handler: () => setConfirmHide(true),
          },
          { text: 'Cancel', role: 'cancel' },
        ]}
      />
    </IonPage>
  );
}
