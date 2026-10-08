// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-17 (My Profile) and SCR-18 (User Profile) share one implementation — the API itself treats
// `username: undefined` as "the active account's own" for every relevant endpoint
// (getUserProfile, entries/journal, entries/favorites), and the two screens are ~90% identical
// (header, About/Entries/Faves tabs, Followers/Following/Awards links). What differs is gated on
// `isOwn` below: the Follow/Unfollow button and Hide never apply to your own profile.
//
// Followers/Following are tabs after About/Entries/Faves (the same scrolling segment bar as
// Browse) showing the SCR-19 people list inline; their own routes stay for deep links. Awards is a
// navigation shortcut to SCR-22. The stat row is Entries (left), the Follow action or, on your own
// profile, Pending requests (middle), and Awards (right).
//
// TODO(Phase 5+): "Remove follower" (SCR-18's overflow, for someone who currently follows you)
// needs to know whether *they* follow *you* — getUserProfile's friendship object is viewer-
// relative (do you follow them), not the reverse, and no cheap way to get that without a separate
// call exists yet. SCR-19's Followers list already offers this correctly (the list itself
// confirms who's a follower); SCR-18 defers to it rather than guessing.

import { useEffect, useState } from 'react';
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
  IonLabel,
  IonAlert,
} from '@ionic/react';
import { UserX } from 'lucide-react';
import { AppHeader } from '../../components/AppHeader.js';
import { useResource } from '../../data/useResource.js';
import { usePagedResource } from '../../data/usePagedResource.js';
import {
  fetchUserProfile,
  fetchJournalEntriesFor,
  fetchFavoriteEntriesFor,
  fetchAwards,
  PAGE_SIZE,
  JOURNAL_PAGE_SIZE,
} from '../../data/users.js';
import { followUser, unfollowUser } from '../../flows/reactionsFlow.js';
import { signInGated } from '../../flows/accountsFlow.js';
import { describeError, mapApiError } from '../../data/errors.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useOverlay } from '../../app/OverlayProvider.js';
import { useAccountsStore, useActiveAccount } from '../../state/accountsStore.js';
import { resumeClear, resumeGet, resumeSet } from '../../data/resumeCache.js';
import { useHiddenMembersStore, useIsHidden } from '../../state/hiddenMembersStore.js';
import { CachedImage } from '../../components/CachedImage.js';
import { UserBadges } from '../../components/UserBadges.js';
import { EntryGrid } from '../../components/EntryGrid.js';
import { PeopleList } from '../../components/PeopleList.js';
import { ScrollEdgeHint } from '../../components/ScrollEdgeHint.js';
import { openUrl } from '../../platform/browser.js';
import type { Page } from '../../data/usePagedResource.js';
import { BBCodeText } from '@b-oss/b-view';
import type { EntryIndex } from '@b-oss/b-view';

interface ProfileScreenProps {
  username?: string;
}

type Tab = 'about' | 'entries' | 'faves' | 'followers' | 'following';

const TABS: [Tab, string][] = [
  ['about', 'About'],
  ['entries', 'Entries'],
  ['faves', 'Faves'],
  ['followers', 'Followers'],
  ['following', 'Following'],
];

const statCellStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '6px 4px',
  minWidth: 64,
} as const;
const statCountStyle = { fontSize: '1rem', color: 'var(--ink)' } as const;
const statLabelStyle = { fontSize: '0.8125rem', color: 'var(--muted)' } as const;

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
    <div style={{ flex: 1, minHeight: 0, paddingBottom: 8 }}>
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
        overlayContent={showCalendar ? 'date-title' : 'journal'}
      />
    </div>
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
  // Awards are the one count the API gives cheaply (the list itself); followers/following have no
  // totals. Best-effort: the stat just shows its label if this fails.
  const [awardCount, setAwardCount] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    setAwardCount(null);
    fetchAwards(effectiveUsername)
      .then((a) => live && setAwardCount(a.length))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [effectiveUsername]);
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fillsHeight =
    (tab === 'entries' || tab === 'faves') && state.status === 'loaded' && state.data.visible;

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
          title={isOwn ? 'My profile' : 'Profile'}
          variant={isOwn ? 'menu' : 'back'}
          backHref="/browse"
          // Shows the account indicator on own AND other profiles (following acts as the
          // active account), so it is always on rather than the menu-variant default.
          accountIndicator
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
          // Grid tabs fill exactly the room left under the header block (the grid fits whole
          // rows to its measured height); the other tabs flow and scroll with the content.
          <div
            style={
              fillsHeight ? { height: '100%', display: 'flex', flexDirection: 'column' } : undefined
            }
          >
            <div
              style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                padding: '12px 16px 8px',
              }}
            >
              <CachedImage
                src={state.data.user.avatar_url}
                alt=""
                style={{ width: 48, height: 48, borderRadius: '50%', flex: 'none' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2
                  style={{
                    margin: 0,
                    fontSize: '1.125rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {state.data.user.username}
                  <UserBadges icons={state.data.user.icons} size={16} />
                </h2>
                {state.data.details?.journal_title && (
                  <p
                    style={{
                      margin: 0,
                      color: 'var(--muted)',
                      fontSize: '0.875rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {state.data.details.journal_title}
                  </p>
                )}
              </div>
              {!isOwn && (
                <button
                  aria-label={`Hide ${state.data.user.username}`}
                  onClick={() => setConfirmHide(true)}
                  style={{
                    flex: 'none',
                    background: 'none',
                    border: 'none',
                    padding: 8,
                    cursor: 'pointer',
                    color: 'var(--muted)',
                  }}
                >
                  <UserX size={20} strokeWidth={1.6} aria-hidden="true" />
                </button>
              )}
            </div>

            <nav
              aria-label="Journal statistics"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 16px',
                minHeight: 48,
              }}
            >
              {state.data.details ? (
                <div style={statCellStyle}>
                  <strong style={statCountStyle}>{state.data.details.entry_total}</strong>
                  <span style={statLabelStyle}>Entries</span>
                </div>
              ) : (
                <span />
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                {!isOwn && friendship === 1 && (
                  <IonButton fill="outline" size="small" onClick={() => setConfirmUnfollow(true)}>
                    Following
                  </IonButton>
                )}
                {!isOwn && friendship === 2 && (
                  <IonButton fill="outline" size="small" disabled>
                    Request sent
                  </IonButton>
                )}
                {!isOwn && (friendship === 0 || friendship === 3) && (
                  <IonButton size="small" onClick={() => void handleFollow()}>
                    Follow
                  </IonButton>
                )}
                {isOwn && state.data.details?.privacy === 1 && (
                  <IonButton size="small" onClick={() => navigate.push('/me/requests')}>
                    Pending requests
                  </IonButton>
                )}
              </div>
              <button
                type="button"
                onClick={() =>
                  navigate.push(
                    isOwn ? '/me/awards' : `/user/${encodeURIComponent(effectiveUsername!)}/awards`,
                  )
                }
                style={{
                  ...statCellStyle,
                  background: 'none',
                  border: 0,
                  font: 'inherit',
                  cursor: 'pointer',
                }}
              >
                {awardCount != null && <strong style={statCountStyle}>{awardCount}</strong>}
                <span style={{ ...statLabelStyle, color: 'var(--green-800)' }}>Awards</span>
              </button>
            </nav>

            <IonToolbar>
              <ScrollEdgeHint>
                <IonSegment
                  value={tab}
                  scrollable
                  onIonChange={(e) => handleTabChange(e.detail.value as Tab)}
                >
                  {TABS.map(([value, label]) => (
                    <IonSegmentButton key={value} value={value}>
                      <IonLabel>{label}</IonLabel>
                    </IonSegmentButton>
                  ))}
                </IonSegment>
              </ScrollEdgeHint>
            </IonToolbar>

            {!state.data.visible ? (
              <div className="ion-padding">
                <p>This journal is protected.</p>
              </div>
            ) : (
              <>
                {tab === 'about' && (
                  <section className="ion-padding" aria-label="About">
                    {state.data.details?.biography ? (
                      <BBCodeText
                        source={state.data.details.biography}
                        onLinkClick={(href) => void openUrl(href)}
                      />
                    ) : (
                      <p style={{ margin: 0, color: 'var(--muted)' }}>No biography.</p>
                    )}
                    {state.data.details?.country_code && (
                      <p
                        style={{ margin: '16px 0 0', color: 'var(--muted)', fontSize: '0.875rem' }}
                      >
                        Country: {state.data.details.country_code}
                      </p>
                    )}
                  </section>
                )}
                {tab === 'followers' && (
                  <PeopleList username={effectiveUsername!} mode="followers" />
                )}
                {tab === 'following' && (
                  <PeopleList username={effectiveUsername!} mode="following" />
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
          </div>
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
    </IonPage>
  );
}
