// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-19 — Followers / Following. One component for both lists (FLW-08's underlying data shape
// is identical; only the fetcher, title, and "own followers get Remove follower" condition
// differ). Not a route param for `mode` — the two routes (`/user/:username/followers` and
// `/user/:username/following`) are distinct paths per §5, so AppRoutes.tsx passes it as a prop.

import { useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonContent,
  IonSpinner,
  IonText,
  IonButton,
  IonAlert,
  IonRefresher,
  IonRefresherContent,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
} from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/core';
import { X } from 'lucide-react';
import { AppHeader } from '../../components/AppHeader.js';
import { usePagedResource } from '../../data/usePagedResource.js';
import { fetchFollowers, fetchFollowing } from '../../data/users.js';
import { removeFollower } from '../../flows/connectionsFlow.js';
import { describeError, mapApiError } from '../../data/errors.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useOverlay } from '../../app/OverlayProvider.js';
import { useActiveAccount, useCanWrite } from '../../state/accountsStore.js';
import { UserRow } from '../../components/UserRow.js';
import type { BlipUser } from '@b-oss/b-api';

interface FollowersFollowingScreenProps {
  username: string;
  mode: 'followers' | 'following';
}

export function FollowersFollowingScreen({ username, mode }: FollowersFollowingScreenProps) {
  const navigate = useAppNavigate();
  const { showUpgradePrompt } = useOverlay();
  const activeAccount = useActiveAccount();
  const canWrite = useCanWrite();
  const isOwnFollowers = mode === 'followers' && activeAccount?.username === username;

  const resource = usePagedResource(
    (pageIndex) =>
      mode === 'followers'
        ? fetchFollowers(username, pageIndex)
        : fetchFollowing(username, pageIndex),
    [username, mode],
  );

  const [removeTarget, setRemoveTarget] = useState<BlipUser | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function requestRemove(user: BlipUser): void {
    if (!canWrite) {
      showUpgradePrompt();
      return;
    }
    setRemoveTarget(user);
  }

  async function confirmRemove(): Promise<void> {
    if (!removeTarget) return;
    const target = removeTarget;
    setRemoveTarget(null);
    try {
      await removeFollower(target.username);
      resource.refresh();
    } catch (err) {
      const outcome = mapApiError(err);
      setErrorMessage(describeError(outcome, 'Could not remove this follower.'));
    }
  }

  function handleRefresh(event: CustomEvent<RefresherEventDetail>): void {
    resource.refresh();
    event.detail.complete();
  }

  function handleInfinite(event: Event): void {
    resource.loadMore();
    void (event.target as HTMLIonInfiniteScrollElement).complete();
  }

  return (
    <IonPage>
      <IonHeader>
        <AppHeader
          title={mode === 'followers' ? 'Followers' : 'Following'}
          variant="back"
          backHref={`/user/${encodeURIComponent(username)}`}
        />
      </IonHeader>
      <IonContent>
        {resource.status === 'loading' && (
          <div className="ion-padding" style={{ display: 'flex', justifyContent: 'center' }}>
            <IonSpinner />
          </div>
        )}
        {resource.status === 'error' && (
          <div className="ion-padding">
            <IonText color="danger">
              <p>{resource.errorMessage}</p>
            </IonText>
            <IonButton onClick={resource.refresh}>Retry</IonButton>
          </div>
        )}
        {resource.status === 'empty' && (
          <div className="ion-padding">
            <p>{mode === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}</p>
          </div>
        )}
        {(resource.status === 'loaded' || resource.status === 'empty') && (
          <>
            <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
              <IonRefresherContent />
            </IonRefresher>
            {resource.items.map((user) => (
              <UserRow
                key={user.username}
                user={user}
                onTap={() => navigate.push(`/user/${encodeURIComponent(user.username)}`)}
              >
                {isOwnFollowers && (
                  <button
                    slot="end"
                    onClick={() => requestRemove(user)}
                    aria-label={`Remove ${user.username}`}
                  >
                    <X size={18} strokeWidth={1.6} color="var(--muted)" />
                  </button>
                )}
              </UserRow>
            ))}
            <IonInfiniteScroll disabled={!resource.hasMore} onIonInfinite={handleInfinite}>
              <IonInfiniteScrollContent />
            </IonInfiniteScroll>
          </>
        )}
      </IonContent>

      <IonAlert
        isOpen={!!removeTarget}
        header={`Remove ${removeTarget?.username ?? ''}?`}
        message="This ends the follow relationship. On a protected journal they lose access but may ask to follow again, and that request can be refused. On a public journal it doesn't stop them seeing your journal — they can simply follow again."
        onDidDismiss={() => setRemoveTarget(null)}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          { text: 'Remove', role: 'destructive', handler: () => void confirmRemove() },
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
