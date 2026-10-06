// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-30 — Accounts. List + switch + add + an inline detail state for mode-change/remove
// (FLW-21, FLW-20, FLW-22). The lighter-weight account-switcher popover (rules.md, Multi-account
// clarity) that mirrors "switch" from anywhere in the nav chrome is built separately
// (app/AccountSwitcherOverlay.tsx, Phase 12.2) — this is the full management screen; `modeLabel`
// is exported so that popover doesn't duplicate the mode-label logic.
//
// Notifications (b-oss#244): no on/off button here any more — each row shows a text status (on /
// off / needs sign-in) that switches to that account and opens Settings → Notifications, where
// the per-stream toggles live. An account whose notification read token died (the
// reauth-required push routes here) also gets **Sign in again**, which re-runs the enable path
// (changeAccountMode) with the streams it had, replacing the dead registration.

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
  IonSpinner,
  IonText,
} from '@ionic/react';
import { AppHeader } from '../../components/AppHeader.js';
import { useAccountsStore, notificationStateOf } from '../../state/accountsStore.js';
import type { StoredAccount, NotificationState } from '../../state/accountsStore.js';
import {
  switchAccount,
  removeAccount,
  changeAccountMode,
  NeedsReauthError,
  OAuthCancelledError,
} from '../../flows/accountsFlow.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { t } from '../../strings/index.js';

const STATUS_TEXT: Record<NotificationState, () => string> = {
  on: () => t('SCR-30.notifications.on'),
  off: () => t('SCR-30.notifications.off'),
  'needs-sign-in': () => t('SCR-30.notifications.needs_sign_in'),
};

export function notificationStatusText(account: StoredAccount): string {
  return STATUS_TEXT[notificationStateOf(account)]();
}

const linkStyle = {
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  fontSize: 14,
  color: 'var(--green-700)',
  textAlign: 'start' as const,
};

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
        <IonNote slot="end">{notificationStatusText(account)}</IonNote>
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

  const [signingInId, setSigningInId] = useState<string | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);

  const detailAccount = accounts.find((a) => a.id === detailId) ?? null;

  /** Tapping a row's notification status: make that account active, then open its settings. */
  function openNotificationSettings(account: StoredAccount) {
    if (account.id !== activeAccountId) {
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
    navigate.push('/settings/notifications');
  }

  /** FLW-02 recovery for a dead notification read token — the same enable path Settings uses,
   * with the account's stored streams (changeAccountMode's default). */
  async function handleSignInAgain(account: StoredAccount) {
    if (signingInId) return;
    setSigningInId(account.id);
    setSignInError(null);
    try {
      await changeAccountMode(account.id, {
        scope: account.appTokenScope ?? 'read,write',
        notifications: true,
      });
    } catch (err) {
      if (!(err instanceof OAuthCancelledError)) {
        setSignInError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
      }
    } finally {
      setSigningInId(null);
    }
  }

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
        <AppHeader title="Accounts" variant="back" backHref="/settings" />
      </IonHeader>
      <IonContent>
        <IonList>
          {accounts.map((account) => {
            const isActive = account.id === activeAccountId;
            return (
              <IonItem key={account.id} button onClick={() => handleRowTap(account)}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0' }}>
                  <span style={isActive ? { fontWeight: 600 } : undefined}>{account.username}</span>
                  <button
                    type="button"
                    style={linkStyle}
                    onClick={(e) => {
                      e.stopPropagation();
                      openNotificationSettings(account);
                    }}
                  >
                    {notificationStatusText(account)}
                  </button>
                  {notificationStateOf(account) === 'needs-sign-in' &&
                    account.appTokenScope !== null && (
                      <IonButton
                        size="small"
                        fill="outline"
                        disabled={signingInId !== null}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleSignInAgain(account);
                        }}
                      >
                        {signingInId === account.id ? (
                          <IonSpinner name="dots" />
                        ) : (
                          t('SCR-30.button.sign_in_again')
                        )}
                      </IonButton>
                    )}
                </div>
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

        {signInError && (
          <div className="ion-padding">
            <IonText color="danger">
              <p>{signInError}</p>
            </IonText>
          </div>
        )}

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
