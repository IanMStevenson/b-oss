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
  IonTitle,
  IonButtons,
  IonBackButton,
  IonMenuButton,
  IonButton,
  IonContent,
  IonSpinner,
  IonText,
  IonSegment,
  IonSegmentButton,
  IonAlert,
  IonActionSheet,
} from '@ionic/react';
import { useResource } from '../../data/useResource.js';
import { usePagedResource } from '../../data/usePagedResource.js';
import {
  fetchUserProfile,
  fetchJournalEntriesFor,
  fetchFavoriteEntriesFor,
} from '../../data/users.js';
import { followUser, unfollowUser } from '../../flows/reactionsFlow.js';
import { signInGated } from '../../flows/accountsFlow.js';
import { describeError, mapApiError } from '../../data/errors.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useOverlay } from '../../app/OverlayProvider.js';
import { AccountIndicator } from '../../components/AccountIndicator.js';
import { useAccountsStore, useActiveAccount } from '../../state/accountsStore.js';
import { useHiddenMembersStore, useIsHidden } from '../../state/hiddenMembersStore.js';
import { CachedImage } from '../../components/CachedImage.js';
import { BBCodeText } from '../../components/BBCodeText.js';
import { EntryGrid } from '../../components/EntryGrid.js';
import type { Page } from '../../data/usePagedResource.js';
import type { EntryIndex } from '@b-oss/b-view';

interface ProfileScreenProps {
  username?: string;
}

type Tab = 'about' | 'entries' | 'faves';

function GridTab({
  fetchPage,
  onSelectEntry,
}: {
  fetchPage: (pageIndex: number) => Promise<Page<EntryIndex>>;
  onSelectEntry: (id: string) => void;
}) {
  const resource = usePagedResource(fetchPage, []);
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

export function ProfileScreen({ username }: ProfileScreenProps) {
  const navigate = useAppNavigate();
  const { showUpgradePrompt } = useOverlay();
  const activeAccount = useActiveAccount();
  const isOwn = username === undefined || username === activeAccount?.username;
  const effectiveUsername = username ?? activeAccount?.username;

  const { state, reload } = useResource(() => fetchUserProfile(username), [username]);
  const isHidden = useIsHidden(effectiveUsername && !isOwn ? effectiveUsername : null);

  const [tab, setTab] = useState<Tab>('about');
  const [visited, setVisited] = useState<Set<Tab>>(new Set(['about']));
  const [friendshipState, setFriendshipState] = useState<0 | 1 | 2 | 3 | null>(null);
  const [confirmUnfollow, setConfirmUnfollow] = useState(false);
  const [confirmHide, setConfirmHide] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const friendship =
    state.status === 'loaded' ? (friendshipState ?? state.data.friendship?.state ?? 0) : 0;

  function handleTabChange(next: Tab): void {
    setTab(next);
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
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
        <IonToolbar>
          <IonButtons slot="start">
            {isOwn ? <IonMenuButton /> : <IonBackButton defaultHref="/browse" />}
          </IonButtons>
          <IonTitle>{isOwn ? 'My profile' : `${username}'s journal`}</IonTitle>
          <IonButtons slot="end">
            {!isOwn && state.status === 'loaded' && (
              <IonButton onClick={() => setOverflowOpen(true)}>More</IonButton>
            )}
            {isOwn && <AccountIndicator />}
          </IonButtons>
        </IonToolbar>
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
                <h2 style={{ margin: 0 }}>
                  {state.data.user.username}
                  {state.data.details?.member === 1 && ' ★member'}
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
                      <BBCodeText source={state.data.details.biography} />
                    ) : (
                      <p>No biography.</p>
                    )}
                  </div>
                )}
                {[...visited].map(
                  (t) =>
                    t !== 'about' && (
                      <div key={t} hidden={t !== tab}>
                        {t === 'entries' && (
                          <GridTab
                            fetchPage={(pageIndex) => fetchJournalEntriesFor(username, pageIndex)}
                            onSelectEntry={(id) => navigate.push(`/entry/${id}`)}
                          />
                        )}
                        {t === 'faves' && (
                          <GridTab
                            fetchPage={(pageIndex) => fetchFavoriteEntriesFor(username, pageIndex)}
                            onSelectEntry={(id) => navigate.push(`/entry/${id}`)}
                          />
                        )}
                      </div>
                    ),
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
