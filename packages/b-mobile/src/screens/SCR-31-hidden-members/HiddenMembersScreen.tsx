// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-31 — Hidden Members (FLW-10). Entirely device-local, no network request — the list is
// already in hiddenMembersStore. The "journal is public" reminder and the "remove them as a
// follower" per-row offer both need journal-privacy/follower-relationship data this phase doesn't
// fetch (SCR-19/SCR-25 are Phase 5/8); both are left as documented TODOs rather than guessed at.

import { IonPage, IonHeader, IonButton, IonContent, IonList, IonItem } from '@ionic/react';
import { EyeOff } from 'lucide-react';
import { AppHeader } from '../../components/AppHeader.js';
import { useAppNavigate, useIsDrilledIn } from '../../app/routes/useAppNavigate.js';
import { useAccountsStore } from '../../state/accountsStore.js';
import { useHiddenMembersStore, useHiddenMembers } from '../../state/hiddenMembersStore.js';

// Hiding is device-local and one-way (they can still see you); said once, muted, rather than as
// three paragraphs.
const EXPLANATION =
  'Hidden members’ entries, comments and notifications are not shown on this device. ' +
  'They can still see your journal and comment on your entries.';

export function HiddenMembersScreen() {
  const navigate = useAppNavigate();
  const drilledIn = useIsDrilledIn();
  const hidden = useHiddenMembers();

  function handleUnhide(username: string): void {
    const account = useAccountsStore.getState();
    if (!account.activeAccountId) return;
    useHiddenMembersStore.getState().unhide(account.activeAccountId, username);
  }

  return (
    <IonPage>
      <IonHeader>
        <AppHeader
          title="Hidden members"
          variant={drilledIn ? 'back' : 'menu'}
          backHref="/settings"
          accountIndicator
        />
      </IonHeader>
      <IonContent className="ion-padding">
        {hidden.length === 0 ? (
          // One line and a muted footnote (UX review 34), centred like the other empty states.
          <div style={{ textAlign: 'center', padding: '48px 16px 0' }}>
            <EyeOff size={40} strokeWidth={1.5} aria-hidden="true" color="var(--muted)" />
            <p style={{ fontSize: '1.1rem', margin: '12px 0 8px' }}>
              You haven&rsquo;t hidden anyone.
            </p>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>{EXPLANATION}</p>
          </div>
        ) : (
          <>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{EXPLANATION}</p>
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
          </>
        )}
      </IonContent>
    </IonPage>
  );
}
