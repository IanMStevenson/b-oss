// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Cloud-notification-service registration lifecycle (notification-service.md's "Registration
// contract", FLW-16/20/22/02). Owns the calls flows/accountsFlow.ts's Phase 2 `TODO(Phase 9)`
// markers were left waiting for — kept in its own module rather than folded into accountsFlow.ts
// because it has a genuinely different job (talking to b-push, not to Blipfoto/secure storage for
// the app's own tokens) even though the two are invoked from the same call sites.

import {
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
import { useAccountsStore } from '../state/accountsStore.js';
import { handleForcedLogout } from './accountsFlow.js';

/** Checked/requested *before* any read-token authorization round for notifications (rules.md:
 * "never make the user authorize something already known to be undeliverable" — app-
 * architecture.md §11 restates this as "Check it before starting the read-token authorization
 * round"). Returns whether permission is held after this call; a refusal is not remembered as a
 * distinct "blocked" state — the caller just doesn't proceed to registration, same as turning the
 * feature off (rules.md's no-remembered-blocked-state rule). */
export async function ensurePushPermission(): Promise<boolean> {
  const current = await checkPushPermission();
  if (current === 'granted') return true;
  if (current === 'denied') return false;
  const requested = await requestPushPermission();
  return requested === 'granted';
}

/** FLW-20/FLW-22 — registers `accountId` with b-push using the given Blipfoto read token.
 * Returns `true` on success. A `false` return (permission refused, OS registration failed, or the
 * service call itself failed) means the caller should *not* mark the account as having
 * notifications on — same principle as the OS-permission-denied path treating "on" as never
 * having happened, not as a remembered failure. */
export async function registerAccountForPush(
  accountId: string,
  readToken: string,
): Promise<boolean> {
  const granted = await ensurePushPermission();
  if (!granted) return false;

  const deviceToken = await registerPush();
  const platform = pushPlatform();
  if (!deviceToken || !platform) return false;

  try {
    const result = await pushService.createRegistration({
      blipfotoUserId: accountId,
      readToken,
      deviceToken,
      platform,
    });
    await setRegistrationSecret(accountId, result.registrationSecret);
    useAccountsStore.getState().updateAccount(accountId, {
      notificationRegistrationId: result.registrationId,
      notificationStatus: 'active',
    });
    return true;
  } catch {
    return false;
  }
}

/** FLW-22/FLW-02 — the one deregistration call, used identically whether the user turned the
 * master switch off, removed the account, or the OS reports permission denied (notification-
 * service.md's `DELETE`: "the app treats them as the same event, not three different ones").
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
  });
}

/** FLW-17 — after a successful Notifications-section save. Best-effort by design (notification-
 * service.md: "If the ping itself fails, no retry — it degrades to the hourly path, never worse
 * than not having pinged at all"). */
export async function pingRefreshPreferences(accountId: string): Promise<void> {
  const account = useAccountsStore.getState().accounts.find((a) => a.id === accountId);
  if (!account?.notificationRegistrationId) return;
  const secret = await getRegistrationSecret(accountId);
  if (!secret) return;
  await pushService.refreshPreferences(account.notificationRegistrationId, secret).catch(() => {});
}

/** `SCR-25`'s Advanced polling-interval control. Throws on failure (unlike the other best-effort
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
 * platform/appState.ts's `onAppStateChange`, per rules.md's "re-check the permission when the app
 * resumes and act on what it now says") — for each account with notifications nominally on: the OS
 * permission and the service's own registration health, "handled exactly as if the corresponding
 * push/decision had already happened." A permission refusal is treated as the user having turned
 * notifications off (full `DELETE`); a `read-token-invalid` registration status is fed into the
 * same `handleForcedLogout('service')` path FLW-02's background-token handling already uses for
 * the reauth-required push. */
export async function runLaunchBackstopCheck(): Promise<void> {
  for (const account of useAccountsStore.getState().accounts) {
    if (!account.hasServiceToken) continue;

    const permission = await checkPushPermission();
    if (permission !== 'granted') {
      await deregisterAccountFromPush(account.id);
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
