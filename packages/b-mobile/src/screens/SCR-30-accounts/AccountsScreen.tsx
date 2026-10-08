// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-30 — Accounts. List + switch + add, with a per-row three-dot menu (left of the avatar) for
// the rarely-used actions: switch read-only/read-write, Disconnect account (remove from the app),
// Delete account (opens blipfoto.com; no delete API) (FLW-21, FLW-20, FLW-22, b-oss#306). The old
// separate account detail view is gone — its mode line and notification status are on the row. The lighter-weight account-switcher popover (rules.md, Multi-account
// clarity) that mirrors "switch" from anywhere in the nav chrome is built separately
// (app/AccountSwitcherOverlay.tsx, Phase 12.2) — this is the full management screen; `modeLabel`
// is exported so that popover doesn't duplicate the mode-label logic.
//
// Notifications (b-oss#244): no on/off button here any more — each row shows a text status (on /
// off / needs sign-in) that switches to that account and opens Settings → Notifications, where
// the per-stream toggles live. An account whose notification read token died (the
// reauth-required push routes here) also gets **Sign in again**, which re-runs the enable path
// with the streams it had, replacing the dead registration, and first checks the app token,
// re-authorizing the whole account if that died too (recoverNotifications, b-oss#261).
//
// Signing in again (b-oss#263): an account needing a sign-in — its app token died (needs-reauth) or
// only its notification token did — shows a red, bold status and a row-level **Sign in again**.
// Every other way in (tapping the row or the red status, picking it in the header switcher, the
// reauth-required push, which arrive here as `/accounts?reauth=<id>`) shows one dialog, "{username}
// needs to sign in again" [Cancel] [Sign in]; the row's button skips the dialog, since it's already
// explicit. Both run accountsFlow.reauthorizeAccount: the app sign-in in the mode the account had,
// then, if it had notifications on, the "One more sign-in" explainer and the notifications round.
// On success the account is active, the user stays here, and a toast confirms it.
//
// Sign in again and the mode-change buttons are token changes for an existing account (b-oss#240):
// the flow owner-checks every round and picks the clean in-app browser when there's more than one
// account here. A round that comes back as someone else shows the mismatch alert, which can retry
// the same change in the in-app browser.

import { useEffect, useRef, useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonContent,
  IonList,
  IonItem,
  IonNote,
  IonButton,
  IonAlert,
  IonActionSheet,
  IonSpinner,
  IonText,
  IonToast,
} from '@ionic/react';
import { AppHeader } from '../../components/AppHeader.js';
import { AccountRowBody } from '../../components/AccountRowBody.js';
import { MoreVertical } from 'lucide-react';
import {
  NEEDS_SIGN_IN_STYLE,
  ACTIVE_ACCOUNT_BACKGROUND,
} from '../../components/accountPresentation.js';
import { useServiceRoundExplainer } from '../../components/ServiceRoundExplainer.js';
import { useAccountsStore, notificationStateOf } from '../../state/accountsStore.js';
import type { StoredAccount, NotificationState } from '../../state/accountsStore.js';
import {
  switchAccount,
  removeAccount,
  changeAccountMode,
  reauthorizeAccount,
  NeedsReauthError,
  OAuthCancelledError,
} from '../../flows/accountsFlow.js';
import { AccountMismatchError } from '../../flows/accountMismatch.js';
import { AccountMismatchAlert, canRetryInApp } from '../../components/AccountMismatchAlert.js';
import { useAppNavigate, useIsDrilledIn } from '../../app/routes/useAppNavigate.js';
import { openUrl } from '../../platform/browser.js';
import { t } from '../../strings/index.js';

// Blipfoto has no delete-account API; this is the page Help's "Delete my account" opened.
const DELETE_ACCOUNT_URL = 'https://www.blipfoto.com/settings/profile#sidebar';

const STATUS_TEXT: Record<NotificationState, () => string> = {
  on: () => t('SCR-30.notifications.on'),
  off: () => t('SCR-30.notifications.off'),
  'needs-sign-in': () => t('SCR-30.notifications.needs_sign_in'),
};

export function notificationStatusText(account: StoredAccount): string {
  return STATUS_TEXT[notificationStateOf(account)]();
}

/** Whether the account needs signing in again (b-oss#263): its app token died, or only its
 * notification token did. Either way it gets the red status and Sign in again. */
export function needsSignIn(account: StoredAccount): boolean {
  return account.appTokenScope === null || notificationStateOf(account) === 'needs-sign-in';
}

const menuButtonStyle = {
  background: 'none',
  border: 'none',
  padding: 4,
  marginInlineStart: -8,
  display: 'flex',
  flexShrink: 0,
};

const linkStyle = {
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  fontSize: 14,
  color: 'var(--muted)',
  textAlign: 'start' as const,
};

function RemoveAccountAlert({
  account,
  onClose,
  onRemove,
}: {
  account: StoredAccount | null;
  onClose: () => void;
  onRemove: (account: StoredAccount) => void;
}) {
  return (
    <IonAlert
      isOpen={account !== null}
      onDidDismiss={onClose}
      header="Disconnect account?"
      message={
        account
          ? `This revokes ${account.username}'s access and removes it from this device. The account itself stays on Blipfoto.`
          : undefined
      }
      buttons={[
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Disconnect',
          role: 'destructive',
          handler: () => {
            if (account) onRemove(account);
          },
        },
      ]}
    />
  );
}

/** A request to open one account's sign-in dialog (`/accounts?reauth=<id>`, b-oss#263). `key`
 * identifies the navigation, so the same request is only acted on once. */
export interface ReauthRequest {
  accountId: string;
  key: string;
}

export function AccountsScreen({ reauthRequest }: { reauthRequest?: ReauthRequest } = {}) {
  const navigate = useAppNavigate();
  const drilledIn = useIsDrilledIn();
  const accounts = useAccountsStore((s) => s.accounts);
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [modeChangeId, setModeChangeId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [modeBusy, setModeBusy] = useState(false);
  const [modeMismatch, setModeMismatch] = useState<{
    error: AccountMismatchError;
    accountId: string;
    scope: 'read' | 'read,write';
    notifications: boolean;
  } | null>(null);
  const [reauthPromptId, setReauthPromptId] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [signingInId, setSigningInId] = useState<string | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signInMismatch, setSignInMismatch] = useState<{
    error: AccountMismatchError;
    account: StoredAccount;
  } | null>(null);

  const explainer = useServiceRoundExplainer({
    cancel: t('SCR-30.reauth.notifications.button_not_now'),
    proceed: t('SCR-30.reauth.notifications.button_continue'),
  });

  const menuAccount = accounts.find((a) => a.id === menuId) ?? null;
  const modeChangeAccount = accounts.find((a) => a.id === modeChangeId) ?? null;
  const deleteAccount = accounts.find((a) => a.id === deleteId) ?? null;
  const reauthAccount = accounts.find((a) => a.id === reauthPromptId) ?? null;
  const removeTarget = accounts.find((a) => a.id === removeId) ?? null;

  // The header switcher and the reauth-required push arrive as `/accounts?reauth=<id>` (b-oss#263).
  // Handled once per navigation (its key), so coming back to this screen, or the account list
  // changing under it, never re-opens the dialog.
  const handledReauthKey = useRef<string | null>(null);
  const reauthAccountId = reauthRequest?.accountId;
  const reauthKey = reauthRequest?.key;
  useEffect(() => {
    if (!reauthAccountId || reauthKey === undefined) return;
    if (handledReauthKey.current === reauthKey) return;
    handledReauthKey.current = reauthKey;
    const target = useAccountsStore.getState().accounts.find((a) => a.id === reauthAccountId);
    if (target && needsSignIn(target)) {
      setReauthPromptId(target.id);
    }
  }, [reauthAccountId, reauthKey]);

  /** Tapping a row's notification status: make that account active, then open its settings. A
   * status that needs a sign-in offers the sign-in instead. */
  function openNotificationSettings(account: StoredAccount) {
    if (needsSignIn(account)) {
      setReauthPromptId(account.id);
      return;
    }
    if (account.id !== activeAccountId) {
      try {
        switchAccount(account.id);
      } catch (err) {
        if (err instanceof NeedsReauthError) {
          setReauthPromptId(account.id);
          return;
        }
        throw err;
      }
    }
    navigate.push('/settings/notifications');
  }

  /** FLW-02 recovery, b-oss#263: the whole re-sign-in, whichever token died. */
  async function handleSignInAgain(account: StoredAccount, useEmbedded?: boolean) {
    if (signingInId) return;
    setSigningInId(account.id);
    setSignInError(null);
    try {
      const { signedIn } = await reauthorizeAccount(account.id, {
        ...(useEmbedded === undefined ? {} : { useEmbedded }),
        beforeServiceRound: () =>
          explainer.ask({
            header: t('SCR-30.reauth.notifications.title'),
            message: t('SCR-30.reauth.notifications.body', { username: account.username }),
          }),
      });
      if (signedIn) {
        setToast(t('SCR-30.toast.signed_in_again', { username: account.username }));
      }
    } catch (err) {
      if (err instanceof AccountMismatchError) {
        setSignInMismatch({ error: err, account });
      } else if (!(err instanceof OAuthCancelledError)) {
        setSignInError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
      }
    } finally {
      setSigningInId(null);
    }
  }

  function handleRowTap(account: StoredAccount) {
    if (account.appTokenScope === null) {
      setReauthPromptId(account.id);
      return;
    }
    if (account.id === activeAccountId) return;
    try {
      switchAccount(account.id);
    } catch (err) {
      if (err instanceof NeedsReauthError) {
        setReauthPromptId(account.id);
        return;
      }
      throw err;
    }
  }

  async function handleRemove(account: StoredAccount) {
    await removeAccount(account.id);
  }

  /** The per-account menu's mode change: a token change for an existing account, so an OAuth round
   * (b-oss#240); the confirmation before it says so. */
  async function handleModeChange(
    accountId: string,
    scope: 'read' | 'read,write',
    notifications: boolean,
    useEmbedded?: boolean,
  ) {
    setModeBusy(true);
    try {
      await changeAccountMode(accountId, { scope, notifications, useEmbedded });
    } catch (err) {
      if (err instanceof AccountMismatchError) {
        setModeMismatch({ error: err, accountId, scope, notifications });
        return;
      }
      if (err instanceof OAuthCancelledError) return;
      throw err;
    } finally {
      setModeBusy(false);
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <AppHeader
          title="Accounts"
          variant={drilledIn ? 'back' : 'menu'}
          backHref="/settings"
          accountIndicator={false}
        />
      </IonHeader>
      <IonContent>
        <IonList>
          {accounts.map((account) => {
            const isActive = account.id === activeAccountId;
            const appDead = account.appTokenScope === null;
            const notificationsDead = notificationStateOf(account) === 'needs-sign-in';
            return (
              <IonItem
                key={account.id}
                button
                onClick={() => handleRowTap(account)}
                style={isActive ? { '--background': ACTIVE_ACCOUNT_BACKGROUND } : undefined}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    width: '100%',
                    padding: '8px 0',
                  }}
                >
                  <button
                    type="button"
                    aria-label={`Account options for ${account.username}`}
                    style={menuButtonStyle}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuId(account.id);
                    }}
                  >
                    <MoreVertical size={20} strokeWidth={1.6} color="var(--muted)" />
                  </button>
                  <AccountRowBody account={account} active={isActive}>
                    {!appDead && (
                      <button
                        type="button"
                        style={
                          notificationsDead ? { ...linkStyle, ...NEEDS_SIGN_IN_STYLE } : linkStyle
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          openNotificationSettings(account);
                        }}
                      >
                        {notificationStatusText(account)}
                      </button>
                    )}
                    {needsSignIn(account) && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <IonButton
                          size="small"
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
                      </div>
                    )}
                  </AccountRowBody>
                </div>
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

        {/* Overlays live outside the list/detail switch so they stay mounted: an alert that
            unmounts while open never fires onDidDismiss, which is how the old Re-authorize prompt
            kept its state set and re-opened on Back (b-oss#263). */}
        <AccountMismatchAlert
          error={signInMismatch?.error ?? null}
          canRetry={
            signInMismatch !== null &&
            canRetryInApp(
              signInMismatch.error,
              signInMismatch.account.appTokenScope ??
                signInMismatch.account.lastAppTokenScope ??
                'read,write',
            )
          }
          onClose={(retry) => {
            const retrying = signInMismatch?.account;
            setSignInMismatch(null);
            if (retry && retrying) void handleSignInAgain(retrying, true);
          }}
        />
        <IonAlert
          isOpen={reauthAccount !== null}
          onDidDismiss={() => setReauthPromptId(null)}
          header={
            reauthAccount
              ? t('SCR-30.reauth.title', { username: reauthAccount.username })
              : undefined
          }
          message={t('SCR-30.reauth.body')}
          buttons={[
            {
              text: t('SCR-30.reauth.button_cancel'),
              role: 'cancel',
              handler: () => setReauthPromptId(null),
            },
            {
              text: t('SCR-30.reauth.button_sign_in'),
              handler: () => {
                const target = reauthAccount;
                setReauthPromptId(null);
                if (target) void handleSignInAgain(target);
              },
            },
          ]}
        />
        <IonActionSheet
          isOpen={menuAccount !== null}
          header={menuAccount?.username}
          onDidDismiss={() => setMenuId(null)}
          buttons={[
            ...(menuAccount && menuAccount.appTokenScope !== null
              ? [
                  {
                    text:
                      menuAccount.appTokenScope === 'read,write'
                        ? t('SCR-30.detail.switch_to_read_only')
                        : t('SCR-30.detail.switch_to_read_write'),
                    handler: () => setModeChangeId(menuAccount.id),
                  },
                ]
              : []),
            {
              text: 'Disconnect account',
              role: 'destructive' as const,
              handler: () => {
                if (menuAccount) setRemoveId(menuAccount.id);
              },
            },
            {
              text: 'Delete account',
              role: 'destructive' as const,
              handler: () => {
                if (menuAccount) setDeleteId(menuAccount.id);
              },
            },
            { text: 'Cancel', role: 'cancel' as const },
          ]}
        />
        <IonAlert
          isOpen={modeChangeAccount !== null}
          onDidDismiss={() => setModeChangeId(null)}
          header={
            modeChangeAccount?.appTokenScope === 'read,write'
              ? t('SCR-30.detail.switch_to_read_only')
              : t('SCR-30.detail.switch_to_read_write')
          }
          message={
            modeChangeAccount
              ? `Blipfoto will ask ${modeChangeAccount.username} to sign in again and approve ${
                  modeChangeAccount.appTokenScope === 'read,write'
                    ? 'read-only access'
                    : 'read and write access'
                } before the change takes effect.`
              : undefined
          }
          buttons={[
            { text: 'Cancel', role: 'cancel' },
            {
              text: 'Continue',
              handler: () => {
                const target = modeChangeAccount;
                if (!target || modeBusy) return;
                void handleModeChange(
                  target.id,
                  target.appTokenScope === 'read,write' ? 'read' : 'read,write',
                  target.hasServiceToken,
                );
              },
            },
          ]}
        />
        <AccountMismatchAlert
          error={modeMismatch?.error ?? null}
          canRetry={modeMismatch !== null && canRetryInApp(modeMismatch.error, modeMismatch.scope)}
          onClose={(retry) => {
            const retrying = modeMismatch;
            setModeMismatch(null);
            if (retry && retrying) {
              void handleModeChange(
                retrying.accountId,
                retrying.scope,
                retrying.notifications,
                true,
              );
            }
          }}
        />
        <IonAlert
          isOpen={deleteAccount !== null}
          onDidDismiss={() => setDeleteId(null)}
          header="Delete account"
          message={
            deleteAccount
              ? `Deleting ${deleteAccount.username} happens on blipfoto.com, not in this app. This opens Blipfoto in your browser; make sure you're signed in there as ${deleteAccount.username} before you continue.`
              : undefined
          }
          buttons={[
            { text: 'Cancel', role: 'cancel' },
            {
              text: 'Continue',
              role: 'destructive',
              handler: () => void openUrl(DELETE_ACCOUNT_URL),
            },
          ]}
        />
        <RemoveAccountAlert
          account={removeTarget}
          onClose={() => setRemoveId(null)}
          onRemove={(account) => void handleRemove(account)}
        />
        {explainer.element}
        <IonToast
          isOpen={toast !== null}
          message={toast ?? ''}
          duration={2500}
          onDidDismiss={() => setToast(null)}
        />
      </IonContent>
    </IonPage>
  );
}
