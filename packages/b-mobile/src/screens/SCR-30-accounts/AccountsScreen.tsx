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
  IonSpinner,
  IonText,
  IonToast,
} from '@ionic/react';
import { AppHeader } from '../../components/AppHeader.js';
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
import { t } from '../../strings/index.js';

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

/** Red + bold, for a status that needs the user to act (b-oss#263). */
export const NEEDS_SIGN_IN_STYLE = {
  color: 'var(--ion-color-danger)',
  fontWeight: 700,
} as const;

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
  if (account.appTokenScope === null) return t('SCR-30.status.needs_sign_in');
  return account.appTokenScope === 'read,write' ? 'Read-write' : 'Read-only';
}

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
      header="Remove account?"
      message={
        account
          ? `This revokes ${account.username}'s access and removes it from this device.`
          : undefined
      }
      buttons={[
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Remove',
          role: 'destructive',
          handler: () => {
            if (account) onRemove(account);
          },
        },
      ]}
    />
  );
}

/** The account detail view (the active account's row): mode, notification status, change mode,
 * remove. Only the active account opens it — any other usable account is switched to by tapping
 * its row, and one needing a sign-in gets the sign-in dialog — so there's no Make active here
 * (b-oss#263: it did nothing, as the only way in for an inactive account was a needs-reauth one,
 * which can't be made active without signing in). */
function AccountDetail({ account, onClose }: { account: StoredAccount; onClose: () => void }) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mismatch, setMismatch] = useState<{
    error: AccountMismatchError;
    scope: 'read' | 'read,write';
    notifications: boolean;
  } | null>(null);

  async function handleModeChange(
    scope: 'read' | 'read,write',
    notifications: boolean,
    useEmbedded?: boolean,
  ) {
    setBusy(true);
    try {
      await changeAccountMode(account.id, { scope, notifications, useEmbedded });
    } catch (err) {
      if (err instanceof AccountMismatchError) {
        setMismatch({ error: err, scope, notifications });
        return;
      }
      if (err instanceof OAuthCancelledError) return;
      throw err;
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

  const otherScope = account.appTokenScope === 'read,write' ? 'read' : 'read,write';

  return (
    <IonList>
      <IonItem>
        <span>{t('SCR-30.detail.mode')}</span>
        <IonNote slot="end">{modeLabel(account)}</IonNote>
      </IonItem>
      <IonItem>
        <span>{t('SCR-30.detail.notifications')}</span>
        <IonNote slot="end">{notificationStatusText(account)}</IonNote>
      </IonItem>

      <div className="ion-padding">
        <IonButton
          expand="block"
          fill="outline"
          disabled={busy}
          onClick={() => void handleModeChange(otherScope, account.hasServiceToken)}
        >
          {otherScope === 'read'
            ? t('SCR-30.detail.switch_to_read_only')
            : t('SCR-30.detail.switch_to_read_write')}
        </IonButton>
        <IonButton
          expand="block"
          fill="outline"
          color="danger"
          disabled={busy}
          onClick={() => setConfirmRemove(true)}
        >
          Remove account
        </IonButton>
      </div>

      <AccountMismatchAlert
        error={mismatch?.error ?? null}
        canRetry={mismatch !== null && canRetryInApp(mismatch.error, mismatch.scope)}
        onClose={(retry) => {
          const retrying = mismatch;
          setMismatch(null);
          if (retry && retrying) {
            void handleModeChange(retrying.scope, retrying.notifications, true);
          }
        }}
      />
      <RemoveAccountAlert
        account={confirmRemove ? account : null}
        onClose={() => setConfirmRemove(false)}
        onRemove={() => void handleRemove()}
      />
    </IonList>
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
  const [detailId, setDetailId] = useState<string | null>(null);
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

  const detailAccount = accounts.find((a) => a.id === detailId) ?? null;
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
      setDetailId(null);
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
      setDetailId(null);
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
    if (account.id === activeAccountId) {
      setDetailId(account.id);
      return;
    }
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

  return (
    <IonPage>
      <IonHeader>
        {detailAccount ? (
          <AppHeader
            title={detailAccount.username}
            variant="back"
            onBack={() => setDetailId(null)}
          />
        ) : (
          <AppHeader
            title="Accounts"
            variant={drilledIn ? 'back' : 'menu'}
            backHref="/settings"
            accountIndicator={false}
          />
        )}
      </IonHeader>
      <IonContent>
        {detailAccount ? (
          <AccountDetail account={detailAccount} onClose={() => setDetailId(null)} />
        ) : (
          <IonList>
            {accounts.map((account) => {
              const isActive = account.id === activeAccountId;
              const appDead = account.appTokenScope === null;
              const notificationsDead = notificationStateOf(account) === 'needs-sign-in';
              return (
                <IonItem key={account.id} button onClick={() => handleRowTap(account)}>
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0' }}
                  >
                    <span style={isActive ? { fontWeight: 600 } : undefined}>
                      {account.username}
                    </span>
                    {appDead ? (
                      <span style={{ ...NEEDS_SIGN_IN_STYLE, fontSize: 14 }}>
                        {t('SCR-30.status.needs_sign_in')}
                      </span>
                    ) : (
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
                      <div style={{ display: 'flex', gap: 8 }}>
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
                        {appDead && (
                          <IonButton
                            size="small"
                            fill="clear"
                            color="medium"
                            disabled={signingInId !== null}
                            onClick={(e) => {
                              e.stopPropagation();
                              setRemoveId(account.id);
                            }}
                          >
                            {t('SCR-30.button.remove')}
                          </IonButton>
                        )}
                      </div>
                    )}
                  </div>
                  {!appDead && (
                    <IonNote
                      slot="end"
                      style={isActive ? { color: 'var(--green-800)' } : undefined}
                    >
                      {isActive ? `Active · ${modeLabel(account)}` : modeLabel(account)}
                    </IonNote>
                  )}
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
        )}

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
