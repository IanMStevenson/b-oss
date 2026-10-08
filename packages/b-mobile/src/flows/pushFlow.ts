// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Cloud-notification-service registration lifecycle (b-push ARCHITECTURE.md's "Registration
// contract", FLW-16/20/22/02). Owns the calls flows/accountsFlow.ts's Phase 2 `TODO(Phase 9)`
// markers were left waiting for — kept in its own module rather than folded into accountsFlow.ts
// because it has a genuinely different job (talking to b-push, not to Blipfoto/secure storage for
// the app's own tokens) even though the two are invoked from the same call sites.

import {
  isPushAvailable,
  checkPushPermission,
  requestPushPermission,
  registerPush,
  pushPlatform,
} from '../platform/push.js';
import {
  getRegistrationSecret,
  setRegistrationSecret,
  deleteRegistrationSecret,
} from '../platform/secureStorage.js';
import * as pushService from '../data/pushService.js';
import { useAccountsStore, ALL_PUSH_STREAMS } from '../state/accountsStore.js';
import type { PushStreams } from '../state/accountsStore.js';
import { clearServiceToken, handleForcedLogout } from './accountsFlow.js';
import { AccountMismatchError } from './accountMismatch.js';
import type { PushPayload } from '../platform/push.js';
import { authReady } from '../state/authReady.js';

/** Checked/requested *before* any read-token authorization round for notifications: never make
 * the user authorize something already known to be undeliverable (app-architecture.md §11).
 * Returns whether permission is held after this call; a refusal is not remembered as a distinct
 * "blocked" state — the caller just doesn't proceed to registration, same as turning the feature
 * off. */
export async function ensurePushPermission(): Promise<boolean> {
  // A build without Firebase credentials can never deliver, so don't even prompt for permission
  // (same "never authorize something already known to be undeliverable" rule as above).
  if (!(await isPushAvailable())) return false;
  const current = await checkPushPermission();
  if (current === 'granted') return true;
  if (current === 'denied') return false;
  const requested = await requestPushPermission();
  return requested === 'granted';
}

/** FLW-20/FLW-22 — registers `accountId` with b-push using the given Blipfoto read token, with
 * the chosen push streams (b-oss#244; both on unless the caller says otherwise — e.g. Settings
 * turning on just one of the two from off). Returns `true` on success. A `false` return
 * (permission refused, OS registration failed, or the service call itself failed) means the
 * caller should *not* mark the account as having notifications on — same principle as the
 * OS-permission-denied path treating "on" as never having happened, not as a remembered failure.
 *
 * If the account still has an older registration (the "Sign in again" recovery after the
 * service reported its read token dead — FLW-02 keeps the registration id and secret), that row
 * is deleted best-effort once the new one exists, so it isn't left orphaned on the service.
 *
 * The one failure that *is* thrown: b-push's 403 for a read token that belongs to a different
 * Blipfoto account (its owner check, b-oss#240) becomes AccountMismatchError. The app checks the
 * owner itself after every round first, so this is defence in depth — but if it ever fires, the
 * user needs the same "wrong account" explanation, not a silent no-op. */
export async function registerAccountForPush(
  accountId: string,
  readToken: string,
  streams: PushStreams = ALL_PUSH_STREAMS,
): Promise<boolean> {
  const granted = await ensurePushPermission();
  if (!granted) return false;

  const deviceToken = await registerPush();
  const platform = pushPlatform();
  if (!deviceToken || !platform) return false;

  const previous = useAccountsStore.getState().accounts.find((a) => a.id === accountId);
  const staleRegistrationId = previous?.notificationRegistrationId ?? null;
  const staleSecret = staleRegistrationId ? await getRegistrationSecret(accountId) : null;

  try {
    const result = await pushService.createRegistration({
      blipfotoUserId: accountId,
      readToken,
      deviceToken,
      platform,
      pushComments: streams.comments,
      pushNotifications: streams.notifications,
    });
    await setRegistrationSecret(accountId, result.registrationSecret);
    useAccountsStore.getState().updateAccount(accountId, {
      notificationRegistrationId: result.registrationId,
      notificationStatus: 'active',
      pushComments: streams.comments,
      pushNotifications: streams.notifications,
    });
    if (staleRegistrationId && staleSecret && staleRegistrationId !== result.registrationId) {
      await pushService.deleteRegistration(staleRegistrationId, staleSecret).catch(() => {});
    }
    return true;
  } catch (err) {
    if (err instanceof pushService.PushServiceError && err.status === 403) {
      throw new AccountMismatchError(accountId, null);
    }
    return false;
  }
}

/** FLW-22/FLW-02 — the one deregistration call, used identically whether the user turned the
 * last push stream off, removed the account, or the OS reports permission denied (b-push
 * ARCHITECTURE.md's `DELETE`: the app treats them as the same event, not three different ones).
 * Best-effort against the service (the row is stale either way once the local secret is gone);
 * always clears local state regardless of whether the network call succeeds. */
export async function deregisterAccountFromPush(accountId: string): Promise<void> {
  const account = useAccountsStore.getState().accounts.find((a) => a.id === accountId);
  const registrationId = account?.notificationRegistrationId ?? null;
  const secret = await getRegistrationSecret(accountId);

  if (registrationId && secret) {
    await pushService.deleteRegistration(registrationId, secret).catch(() => {
      // The service row is orphaned either way once the local secret below is gone — there's no
      // retry mechanism for a fire-and-forget delete, and the account-level state must not stay
      // "on" just because this one network call failed.
    });
  }
  await deleteRegistrationSecret(accountId);
  useAccountsStore.getState().updateAccount(accountId, {
    notificationRegistrationId: null,
    notificationStatus: null,
    pushComments: undefined,
    pushNotifications: undefined,
  });
}

/** SCR-25 — change which streams a live registration pushes (b-oss#244), while at least one
 * stays on (turning the last one off is a deregistration, not a PATCH — see changeAccountMode).
 * The local copy is updated only after the service accepts the change, so the toggles never show
 * something the service isn't doing. Throws on failure: the user just moved a visible control. */
export async function updatePushStreams(accountId: string, streams: PushStreams): Promise<void> {
  const account = useAccountsStore.getState().accounts.find((a) => a.id === accountId);
  const secret = account?.notificationRegistrationId
    ? await getRegistrationSecret(accountId)
    : null;
  if (!account?.notificationRegistrationId || !secret) {
    throw new Error('This account has no active notification registration.');
  }
  await pushService.patchRegistration(account.notificationRegistrationId, secret, {
    pushComments: streams.comments,
    pushNotifications: streams.notifications,
  });
  useAccountsStore.getState().updateAccount(accountId, {
    pushComments: streams.comments,
    pushNotifications: streams.notifications,
  });
}

/** `SCR-25`'s check-interval control. Throws on failure (unlike the other best-effort
 * calls above) — this one has a visible UI control the user just interacted with, so a failure
 * should be shown, not silently swallowed. */
export async function updatePollingInterval(accountId: string, minutes: number): Promise<void> {
  const account = useAccountsStore.getState().accounts.find((a) => a.id === accountId);
  if (!account?.notificationRegistrationId) {
    throw new Error('This account has no active notification registration.');
  }
  const secret = await getRegistrationSecret(accountId);
  if (!secret) {
    throw new Error('This account has no active notification registration.');
  }
  await pushService.patchRegistration(account.notificationRegistrationId, secret, {
    pollIntervalMinutes: minutes,
  });
}

/** The `'registration'` event fires again on FCM token rotation, for the app as a whole — every
 * account currently registered needs its device token updated with the service, or pushes
 * silently stop reaching this device (FLW-16: "the app must call this on FCM token rotation or
 * pushes silently stop"). Best-effort per account; one failure must not skip the rest. */
export async function handleDeviceTokenRotated(newToken: string): Promise<void> {
  for (const account of useAccountsStore.getState().accounts) {
    if (!account.notificationRegistrationId) continue;
    const secret = await getRegistrationSecret(account.id);
    if (!secret) continue;
    await pushService
      .patchRegistration(account.notificationRegistrationId, secret, { deviceToken: newToken })
      .catch(() => {});
  }
}

/** FLW-16 step 8 — every app launch *and* every resume (AppShell.tsx wires both via
 * platform/appState.ts's `onAppStateChange`; BEHAVIOUR.md, Notifications) — for each account with
 * notifications nominally on, re-check the OS permission and the service's own registration
 * health and act on what they now say, exactly as if the corresponding push/decision had already
 * happened. A permission refusal is treated as the user having turned
 * notifications off (full `DELETE`); a `read-token-invalid` registration status is fed into the
 * same `handleForcedLogout('service')` path FLW-02's background-token handling already uses for
 * the reauth-required push. */
export async function runLaunchBackstopCheck(): Promise<void> {
  for (const account of useAccountsStore.getState().accounts) {
    if (!account.hasServiceToken) continue;

    const permission = await checkPushPermission();
    if (permission !== 'granted') {
      await clearServiceToken(account.id, account.appTokenScope);
      continue;
    }

    if (!account.notificationRegistrationId) continue;
    const secret = await getRegistrationSecret(account.id);
    if (!secret) continue;

    try {
      const status = await pushService.getRegistrationStatus(
        account.notificationRegistrationId,
        secret,
      );
      if (status.status === 'read-token-invalid') {
        handleForcedLogout(account.id, 'service');
      }
    } catch {
      // A transient failure to reach b-push at launch isn't itself a signal — the reauth-required
      // push (when the service can reach the device) remains the primary path; this is only a
      // backstop for a missed one.
    }
  }
}

/** FLW-16 — where tapping a push goes. A push names the account it's about, and that isn't
 * necessarily the active one, so switch to it first: otherwise a comment push for one account
 * opened the other account's inbox (b-oss#148). Same rule as switchAccount(): an account that's
 * gone, or whose app token needs re-authorizing, can't simply be switched to, so go to Accounts,
 * where it can be dealt with.
 *
 * Waits for authReady first. Tapping a push when the app isn't running launches it, and the tap
 * arrives before the stored accounts have loaded; reading the store then found no accounts and
 * sent every cold-start tap to Accounts (b-oss#148). */
export async function routeForPushTap(payload: PushPayload): Promise<string> {
  await authReady;
  if (payload.kind === 'reauth-required') {
    // May already have run from onPushReceived or a launch backstop check; it's idempotent.
    handleForcedLogout(payload.accountId, 'service');
    // SCR-30 opens with this account's "needs to sign in again" dialog (b-oss#263).
    return `/accounts?reauth=${encodeURIComponent(payload.accountId)}`;
  }
  const store = useAccountsStore.getState();
  const account = store.accounts.find((a) => a.id === payload.accountId);
  if (!account || account.appTokenScope === null) return '/accounts';
  if (store.activeAccountId !== account.id) store.setActiveAccountId(account.id);
  return payload.stream === 'comments' ? '/comments' : '/notifications';
}
