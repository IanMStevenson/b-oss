// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-31 — Hidden Members (FLW-10). Entirely device-local, no network request — the list is
// already in hiddenMembersStore. The "journal is public" reminder and the "remove them as a
// follower" per-row offer both need journal-privacy/follower-relationship data this phase doesn't
// fetch (SCR-19/SCR-25 are Phase 5/8); both are left as documented TODOs rather than guessed at.

import { IonPage, IonHeader, IonButton, IonContent, IonList, IonItem } from '@ionic/react';
import { AppHeader } from '../../components/AppHeader.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useAccountsStore } from '../../state/accountsStore.js';
import { useHiddenMembersStore, useHiddenMembers } from '../../state/hiddenMembersStore.js';

export function HiddenMembersScreen() {
  const navigate = useAppNavigate();
  const hidden = useHiddenMembers();

  function handleUnhide(username: string): void {
    const account = useAccountsStore.getState();
    if (!account.activeAccountId) return;
    useHiddenMembersStore.getState().unhide(account.activeAccountId, username);
  }

  return (
    <IonPage>
      <IonHeader>
        <AppHeader title="Hidden members" variant="back" backHref="/browse" />
      </IonHeader>
      <IonContent className="ion-padding">
        <p>
          You won&rsquo;t see their entries, comments or notifications on this app on this device.
          This doesn&rsquo;t stop them seeing your journal or commenting on your entries.
        </p>

        {hidden.length === 0 ? (
          <p>You haven&rsquo;t hidden anyone.</p>
        ) : (
          <IonList>
            {hidden.map((username) => (
              <IonItem key={username}>
                <button
                  onClick={() => navigate.push(`/user/${encodeURIComponent(username)}`)}
                  style={{
                    background: 'none',
                    border: 'none',
                    font: 'inherit',
                    textAlign: 'left',
                    flex: 1,
                  }}
                >
                  {username}
                </button>
                <IonButton slot="end" onClick={() => handleUnhide(username)}>
                  Unhide
                </IonButton>
              </IonItem>
            ))}
          </IonList>
        )}

        <p style={{ color: 'var(--muted)' }}>
          Hiding is held on this device for this account, and doesn&rsquo;t transfer elsewhere.
        </p>
      </IonContent>
    </IonPage>
  );
}
