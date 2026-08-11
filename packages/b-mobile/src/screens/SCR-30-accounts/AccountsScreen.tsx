// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-30 — Accounts. List + switch + add + an inline detail state for mode-change/remove
// (FLW-21, FLW-20, FLW-22). The lighter-weight account-switcher popover (rules.md, Multi-account
// clarity) that mirrors "switch" from anywhere in the nav chrome is built separately
// (app/AccountSwitcherOverlay.tsx, Phase 12.2) — this is the full management screen; `modeLabel`
// is exported so that popover doesn't duplicate the mode-label logic.

import { useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonNote,
  IonButton,
  IonButtons,
  IonAlert,
} from '@ionic/react';
import { AppHeader } from '../../components/AppHeader.js';
import { useAccountsStore } from '../../state/accountsStore.js';
import type { StoredAccount } from '../../state/accountsStore.js';
import {
  switchAccount,
  removeAccount,
  changeAccountMode,
  NeedsReauthError,
} from '../../flows/accountsFlow.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';

export function modeLabel(account: StoredAccount): string {
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
        <span>{account.username}</span>
      </IonItem>
      <IonItem>
        <span>Mode</span>
        <IonNote slot="end">{modeLabel(account)}</IonNote>
      </IonItem>
      <IonItem>
        <span>Notifications</span>
        <IonNote slot="end">{account.hasServiceToken ? 'On' : 'Off'}</IonNote>
      </IonItem>

      <IonItem>
        <span>Change mode</span>
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
        <AppHeader title="Accounts" />
      </IonHeader>
      <IonContent>
        <IonList>
          {accounts.map((account) => {
            const isActive = account.id === activeAccountId;
            return (
              <IonItem key={account.id} button onClick={() => handleRowTap(account)}>
                <span style={isActive ? { fontWeight: 600 } : undefined}>{account.username}</span>
                <IonNote slot="end" style={isActive ? { color: 'var(--green-800)' } : undefined}>
                  {isActive ? `Active · ${modeLabel(account)}` : modeLabel(account)}
                </IonNote>
              </IonItem>
            );
          })}
          <IonItem button onClick={() => navigate.push('/sign-in')}>
            <span style={{ color: 'var(--green-700)', fontWeight: 600 }}>Add account</span>
            <IonNote slot="end" style={{ color: 'var(--green-700)', fontSize: '18px' }}>
              +
            </IonNote>
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
