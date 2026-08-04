// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-21 — Refused Followers (FLW-09). Allow (restore access) is immediate, no confirmation —
// exactly as reversible as hiding, per the spec. A write, gated on read-write; the list and
// profile navigation stay available read-only.

import { useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonSpinner,
  IonText,
  IonButton,
  IonAlert,
  IonToast,
  IonRefresher,
  IonRefresherContent,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
} from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/core';
import { usePagedResource } from '../../data/usePagedResource.js';
import { fetchBlockedUsers } from '../../data/users.js';
import { restoreAccess } from '../../flows/connectionsFlow.js';
import { mapApiError } from '../../data/errors.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useCanWrite } from '../../state/accountsStore.js';
import { useIsHidden } from '../../state/hiddenMembersStore.js';
import { UserRow } from '../../components/UserRow.js';
import type { BlipUser } from '@b-oss/b-api';

function RefusedRow({
  user,
  onTap,
  onAllow,
}: {
  user: BlipUser;
  onTap: () => void;
  onAllow: () => void;
}) {
  const alsoHidden = useIsHidden(user.username);
  return (
    <UserRow user={user} onTap={onTap}>
      <div slot="end" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
        <IonButton size="small" onClick={onAllow}>
          Allow
        </IonButton>
        {alsoHidden && <span style={{ fontSize: 12, color: 'var(--muted)' }}>also hidden</span>}
      </div>
    </UserRow>
  );
}

export function RefusedFollowersScreen() {
  const navigate = useAppNavigate();
  const canWrite = useCanWrite();
  const resource = usePagedResource((pageIndex) => fetchBlockedUsers(pageIndex), []);

  const [upgradePromptOpen, setUpgradePromptOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  async function handleAllow(user: BlipUser): Promise<void> {
    if (!canWrite) {
      setUpgradePromptOpen(true);
      return;
    }
    try {
      await restoreAccess(user.username);
      resource.refresh();
      setToastMessage(`${user.username} can see your journal again.`);
    } catch (err) {
      const outcome = mapApiError(err);
      setErrorMessage(outcome.kind === 'message' ? outcome.message : 'Could not restore access.');
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
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/settings" />
          </IonButtons>
          <IonTitle>Refused followers</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <p>They can&rsquo;t see your journal. This doesn&rsquo;t hide their entries from you.</p>

        {resource.status === 'loading' && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <IonSpinner />
          </div>
        )}
        {resource.status === 'error' && (
          <>
            <IonText color="danger">
              <p>{resource.errorMessage}</p>
            </IonText>
            <IonButton onClick={resource.refresh}>Retry</IonButton>
          </>
        )}
        {resource.status === 'empty' && <p>You haven&rsquo;t refused anyone.</p>}
        {(resource.status === 'loaded' || resource.status === 'empty') && (
          <>
            <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
              <IonRefresherContent />
            </IonRefresher>
            {resource.items.map((user) => (
              <RefusedRow
                key={user.username}
                user={user}
                onTap={() => navigate.push(`/user/${encodeURIComponent(user.username)}`)}
                onAllow={() => void handleAllow(user)}
              />
            ))}
            <IonInfiniteScroll disabled={!resource.hasMore} onIonInfinite={handleInfinite}>
              <IonInfiniteScrollContent />
            </IonInfiniteScroll>
          </>
        )}
      </IonContent>

      <IonToast
        isOpen={!!toastMessage}
        message={toastMessage ?? ''}
        duration={2500}
        onDidDismiss={() => setToastMessage(null)}
      />

      <IonAlert
        isOpen={upgradePromptOpen}
        header="Read-only account"
        message="This account is signed in read-only. Sign in for write access to continue."
        onDidDismiss={() => setUpgradePromptOpen(false)}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          { text: 'Manage accounts', handler: () => navigate.push('/accounts') },
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
