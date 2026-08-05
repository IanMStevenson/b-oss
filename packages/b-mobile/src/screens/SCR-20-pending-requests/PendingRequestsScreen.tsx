// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-20 — Pending Requests (FLW-09). Approve/Refuse are writes gated on read-write; the list
// itself and viewing a requester's profile stay available read-only.

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
  IonRefresher,
  IonRefresherContent,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
} from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/core';
import { usePagedResource } from '../../data/usePagedResource.js';
import { fetchPendingRequests } from '../../data/users.js';
import { approveRequest, refuseRequest } from '../../flows/connectionsFlow.js';
import { describeError, mapApiError } from '../../data/errors.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useOverlay } from '../../app/OverlayProvider.js';
import { useCanWrite } from '../../state/accountsStore.js';
import { useAccountsStore } from '../../state/accountsStore.js';
import { useHiddenMembersStore } from '../../state/hiddenMembersStore.js';
import { UserRow } from '../../components/UserRow.js';
import type { BlipUser } from '@b-oss/b-api';

export function PendingRequestsScreen() {
  const navigate = useAppNavigate();
  const canWrite = useCanWrite();
  const { showUpgradePrompt } = useOverlay();
  const resource = usePagedResource((pageIndex) => fetchPendingRequests(pageIndex), []);

  const [refuseTarget, setRefuseTarget] = useState<BlipUser | null>(null);
  const [refusedOk, setRefusedOk] = useState<BlipUser | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function gateOrRun(action: () => void): void {
    if (!canWrite) {
      showUpgradePrompt();
      return;
    }
    action();
  }

  async function handleApprove(user: BlipUser): Promise<void> {
    try {
      await approveRequest(user.username);
      resource.refresh();
    } catch (err) {
      const outcome = mapApiError(err);
      setErrorMessage(describeError(outcome, 'Could not approve this request.'));
    }
  }

  async function confirmRefuse(): Promise<void> {
    if (!refuseTarget) return;
    const target = refuseTarget;
    setRefuseTarget(null);
    try {
      await refuseRequest(target.username);
      resource.refresh();
      setRefusedOk(target);
    } catch (err) {
      const outcome = mapApiError(err);
      setErrorMessage(describeError(outcome, 'Could not refuse this request.'));
    }
  }

  function hideRefused(): void {
    const account = useAccountsStore.getState();
    if (refusedOk && account.activeAccountId) {
      useHiddenMembersStore.getState().hide(account.activeAccountId, refusedOk.username);
    }
    setRefusedOk(null);
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
            <IonBackButton defaultHref="/me" />
          </IonButtons>
          <IonTitle>Follow requests</IonTitle>
        </IonToolbar>
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
            <p>No pending requests.</p>
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
                <IonButton
                  slot="end"
                  size="small"
                  onClick={() => gateOrRun(() => void handleApprove(user))}
                >
                  Approve
                </IonButton>
                <IonButton
                  slot="end"
                  size="small"
                  color="danger"
                  onClick={() => gateOrRun(() => setRefuseTarget(user))}
                >
                  Refuse
                </IonButton>
              </UserRow>
            ))}
            <IonInfiniteScroll disabled={!resource.hasMore} onIonInfinite={handleInfinite}>
              <IonInfiniteScrollContent />
            </IonInfiniteScroll>
          </>
        )}
      </IonContent>

      <IonAlert
        isOpen={!!refuseTarget}
        header={`Refuse ${refuseTarget?.username ?? ''}?`}
        message="They won't be able to see your journal. This doesn't hide their entries from you."
        onDidDismiss={() => setRefuseTarget(null)}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          { text: 'Refuse', role: 'destructive', handler: () => void confirmRefuse() },
        ]}
      />

      <IonAlert
        isOpen={!!refusedOk}
        header="Request refused"
        message="Want to stop seeing their entries too? You can hide them as a separate step."
        onDidDismiss={() => setRefusedOk(null)}
        buttons={[
          { text: 'Done', handler: () => setRefusedOk(null) },
          { text: `Also hide ${refusedOk?.username ?? ''}`, handler: hideRefused },
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
