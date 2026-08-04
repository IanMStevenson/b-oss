// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-30 — Accounts. List + switch + add + an inline detail state for mode-change/remove
// (FLW-21, FLW-20, FLW-22). The lighter-weight account-switcher popover (rules.md, Multi-account
// clarity) that mirrors "switch" from anywhere in the nav chrome isn't built here — this is the
// full management screen; the popover is Phase 3+ work once there's a persistent nav chrome to
// anchor it to.

import { useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonButton,
  IonButtons,
  IonBadge,
  IonAlert,
} from '@ionic/react';
import { useAccountsStore } from '../../state/accountsStore.js';
import type { StoredAccount } from '../../state/accountsStore.js';
import {
  switchAccount,
  removeAccount,
  changeAccountMode,
  NeedsReauthError,
} from '../../flows/accountsFlow.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';

function modeLabel(account: StoredAccount): string {
  if (account.appTokenScope === null) return 'Needs re-auth';
  return account.appTokenScope === 'read,write' ? 'Read-write' : 'Read-only';
}

function AccountDetail({ account, onClose }: { account: StoredAccount; onClose: () => void }) {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleModeChange(scope: 'read' | 'read,write', notifications: boolean) {
    setBusy(true);
    try {
      await changeAccountMode(account.id, { scope, notifications });
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setBusy(true);
    try {
      await removeAccount(account.id);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <IonList>
      <IonItem>
        <IonLabel>{account.username}</IonLabel>
      </IonItem>
      <IonItem>
        <IonLabel>Mode</IonLabel>
        <IonNote slot="end">{modeLabel(account)}</IonNote>
      </IonItem>
      <IonItem>
        <IonLabel>Notifications</IonLabel>
        <IonNote slot="end">{account.hasServiceToken ? 'On' : 'Off'}</IonNote>
      </IonItem>

      <IonItem>
        <IonLabel>Change mode</IonLabel>
      </IonItem>
      <IonButton
        expand="block"
        fill="outline"
        disabled={busy}
        onClick={() => void handleModeChange('read,write', account.hasServiceToken)}
      >
        Read-write
      </IonButton>
      <IonButton
        expand="block"
        fill="outline"
        disabled={busy}
        onClick={() => void handleModeChange('read', account.hasServiceToken)}
      >
        Read-only
      </IonButton>
      <IonButton
        expand="block"
        fill="outline"
        disabled={busy}
        onClick={() =>
          void handleModeChange(account.appTokenScope ?? 'read,write', !account.hasServiceToken)
        }
      >
        {account.hasServiceToken ? 'Turn notifications off' : 'Turn notifications on'}
      </IonButton>

      {activeAccountId !== account.id && (
        <IonButton
          expand="block"
          disabled={busy}
          onClick={() => {
            switchAccount(account.id);
            onClose();
          }}
        >
          Make active
        </IonButton>
      )}
      <IonButton
        expand="block"
        color="danger"
        disabled={busy}
        onClick={() => setConfirmRemove(true)}
      >
        Remove account
      </IonButton>

      <IonAlert
        isOpen={confirmRemove}
        onDidDismiss={() => setConfirmRemove(false)}
        header="Remove account?"
        message={`This revokes ${account.username}'s access and removes it from this device.`}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          { text: 'Remove', role: 'destructive', handler: () => void handleRemove() },
        ]}
      />
    </IonList>
  );
}

export function AccountsScreen() {
  const navigate = useAppNavigate();
  const accounts = useAccountsStore((s) => s.accounts);
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [reauthPrompt, setReauthPrompt] = useState<string | null>(null);

  const detailAccount = accounts.find((a) => a.id === detailId) ?? null;

  function handleRowTap(account: StoredAccount) {
    if (account.id === activeAccountId) {
      setDetailId(account.id);
      return;
    }
    try {
      switchAccount(account.id);
    } catch (err) {
      if (err instanceof NeedsReauthError) {
        setReauthPrompt(account.id);
        return;
      }
      throw err;
    }
  }

  if (detailAccount) {
    return (
      <IonPage>
        <IonHeader>
          <IonToolbar>
            <IonButtons slot="start">
              <IonButton onClick={() => setDetailId(null)}>Back</IonButton>
            </IonButtons>
            <IonTitle>{detailAccount.username}</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent>
          <AccountDetail account={detailAccount} onClose={() => setDetailId(null)} />
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Accounts</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <IonList>
          {accounts.map((account) => (
            <IonItem key={account.id} button onClick={() => handleRowTap(account)}>
              <IonLabel>
                {account.username}
                {account.id === activeAccountId && <IonBadge color="success"> active</IonBadge>}
              </IonLabel>
              <IonNote slot="end">{modeLabel(account)}</IonNote>
            </IonItem>
          ))}
          <IonItem button onClick={() => navigate.push('/sign-in')}>
            <IonLabel>+ Add account</IonLabel>
          </IonItem>
        </IonList>

        <IonAlert
          isOpen={reauthPrompt !== null}
          onDidDismiss={() => setReauthPrompt(null)}
          header="Needs re-authorization"
          message="This account's sign-in has expired. Re-authorize it to switch to it."
          buttons={[
            { text: 'Cancel', role: 'cancel' },
            {
              text: 'Re-authorize',
              handler: () => {
                if (reauthPrompt) setDetailId(reauthPrompt);
              },
            },
          ]}
        />
      </IonContent>
    </IonPage>
  );
}
