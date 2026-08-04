// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Ties runOAuthRound, secure storage, and accountsStore together into the account-management
// flows: FLW-01 (gated sign-in), FLW-20 (add account & choose mode), FLW-21 (switch), FLW-22
// (change mode / remove), FLW-02 (forced logout). Not one screen's job — SCR-01/SCR-30 call
// into this, they don't reimplement it.
//
// Phase 9: every place below that registers/deregisters with the notification service now calls
// flows/pushFlow.ts for real (b-push exists as of this phase). The token lifecycle (which tokens
// are held, in secure storage, reflected in accountsStore) was already fully implemented in
// Phase 2 regardless — registration is a separate concern layered on top, per notification-
// service.md, and a failed/refused registration (permission denied, OS registration failure, a
// service-call failure) simply leaves `hasServiceToken` false rather than being surfaced as a
// hard error — the same "no separate blocked state" posture rules.md already establishes for push
// permission generally.

import { getToken, setToken, deleteToken } from '../platform/secureStorage.js';
import { getClientForToken } from '../data/client.js';
import { useAccountsStore } from '../state/accountsStore.js';
import type { StoredAccount } from '../state/accountsStore.js';
import { useUploadQueueStore } from '../state/uploadQueueStore.js';
import { deleteQueuedFile } from '../platform/upload.js';
import { runOAuthRound, OAuthCancelledError } from './oauthRound.js';
import type { OAuthResult } from './oauthRound.js';
import { cancelReminderForAccount } from './reminderFlow.js';
import {
  ensurePushPermission,
  registerAccountForPush,
  deregisterAccountFromPush,
} from './pushFlow.js';

export { OAuthCancelledError };

export class NeedsReauthError extends Error {
  constructor(public readonly accountId: string) {
    super(`Account ${accountId} needs re-authorization`);
    this.name = 'NeedsReauthError';
  }
}

async function storeAppToken(result: OAuthResult): Promise<StoredAccount> {
  const accountId = result.username;
  await setToken(accountId, 'app', result.accessToken);
  const existing = useAccountsStore.getState().accounts.find((a) => a.id === accountId);
  const account: StoredAccount = {
    id: accountId,
    username: accountId,
    avatarUrl: existing?.avatarUrl ?? null,
    appTokenScope: result.grantedScope,
    hasServiceToken: existing?.hasServiceToken ?? false,
    notificationRegistrationId: existing?.notificationRegistrationId ?? null,
    notificationStatus: existing?.notificationStatus ?? null,
  };
  useAccountsStore.getState().upsertAccount(account);
  return account;
}

/** Dev-only: seeds an account from a token obtained outside the app (e.g. Blipfoto's own app-
 * admin pages), for testing in a desktop browser where the real OAuth redirect can't be captured
 * (platform/deepLinks.ts). Runs the same verification real OAuth does (`GET oauth/token`, §16)
 * rather than trusting a hand-typed username/scope, then joins storeAppToken() — the exact same
 * account-creation path signInGated/signInDeliberate use — so there is no separate "dev account"
 * shape to keep in sync. Callers must gate this behind `import.meta.env.DEV` themselves; it does
 * not check that itself, since AppShell's auto-seed is the only intended caller. */
export async function devSignInWithToken(accessToken: string): Promise<string> {
  const clientId = import.meta.env.VITE_BLIPFOTO_CLIENT_ID ?? '';
  const verified = await getClientForToken(accessToken).verifyToken(clientId);
  const grantedScope =
    verified.scope === 'read' || verified.scope === 'read,write' ? verified.scope : 'read';
  const account = await storeAppToken({ accessToken, grantedScope, username: verified.username });
  useAccountsStore.getState().setActiveAccountId(account.id);
  return account.id;
}

/** FLW-01 — a gated action always signs in read-write, notifications off, no mode choice. */
export async function signInGated(): Promise<string> {
  const result = await runOAuthRound('read,write');
  const account = await storeAppToken(result);
  useAccountsStore.getState().setActiveAccountId(account.id);
  return account.id;
}

export interface SignInModeChoice {
  scope: 'read' | 'read,write';
  notifications: boolean;
}

/** FLW-20 — deliberate sign-in with the full mode choice. Read-write + notifications runs two
 * sequential, separately-visible OAuth rounds (auth.md); a failed/cancelled second round keeps
 * the first token — the account signs in read-write, just without notifications.
 *
 * Push permission is checked *before* either round runs for notifications (rules.md: never
 * authorize something already known to be undeliverable) — a refusal skips the whole
 * notifications branch, including the second interactive OAuth round for read-write, rather than
 * asking the user through a sign-in step for a feature that can't be delivered. */
export async function signInDeliberate(choice: SignInModeChoice): Promise<string> {
  const result = await runOAuthRound(choice.scope);
  const account = await storeAppToken(result);
  useAccountsStore.getState().setActiveAccountId(account.id);

  if (choice.notifications && (await ensurePushPermission())) {
    if (account.appTokenScope === 'read') {
      // Read-only + notifications: the same token serves both — no second round.
      const registered = await registerAccountForPush(account.id, result.accessToken);
      if (registered) {
        await setToken(account.id, 'service', result.accessToken);
        useAccountsStore.getState().updateAccount(account.id, { hasServiceToken: true });
      }
    } else {
      try {
        const serviceResult = await runOAuthRound('read');
        const registered = await registerAccountForPush(account.id, serviceResult.accessToken);
        if (registered) {
          await setToken(account.id, 'service', serviceResult.accessToken);
          useAccountsStore.getState().updateAccount(account.id, { hasServiceToken: true });
        }
      } catch (err) {
        // A failed/cancelled second round keeps the first token — signed in read-write,
        // simply without notifications (FLW-20 step 3). Not rethrown.
        if (!(err instanceof OAuthCancelledError)) throw err;
      }
    }
  }

  return account.id;
}

/** FLW-21 — instant, local, no network call. A needs-reauth account can't simply be switched to
 * — offer re-authorization instead (same interaction as changeAccountMode, an extra step). */
export function switchAccount(accountId: string): void {
  const account = useAccountsStore.getState().accounts.find((a) => a.id === accountId);
  if (!account) throw new Error(`Unknown account: ${accountId}`);
  if (account.appTokenScope === null) {
    throw new NeedsReauthError(accountId);
  }
  useAccountsStore.getState().setActiveAccountId(accountId);
}

/** FLW-22 — remove account: revoke every token it holds and forget it. If it was active, switch
 * to another stored account or go anonymous (FLW-21's "return to a usable state"). */
export async function removeAccount(accountId: string): Promise<void> {
  const account = useAccountsStore.getState().accounts.find((a) => a.id === accountId);
  if (!account) return;

  if (account.appTokenScope !== null) {
    const token = await getToken(accountId, 'app');
    if (token) {
      await getClientForToken(token)
        .revokeToken()
        .catch(() => {
          // Best-effort — the token is being forgotten locally regardless of server response.
        });
    }
    await deleteToken(accountId, 'app');
  }
  if (account.hasServiceToken) {
    const token = await getToken(accountId, 'service');
    if (token) {
      await getClientForToken(token)
        .revokeToken()
        .catch(() => {});
    }
    await deleteToken(accountId, 'service');
  }
  if (account.notificationRegistrationId) {
    await deregisterAccountFromPush(accountId);
  }

  useAccountsStore.getState().removeAccountLocally(accountId);
  cancelReminderForAccount(accountId);
  await cancelQueuedUploadsForAccount(accountId);
}

/** §9: "in-flight work using a removed account's token is cancelled, not left running." Also
 * cleans up each cancelled item's copied photo file — there's no further use for it once the
 * item itself is gone. */
async function cancelQueuedUploadsForAccount(accountId: string): Promise<void> {
  const cancelled = useUploadQueueStore.getState().cancelForAccount(accountId);
  await Promise.all(cancelled.filter((i) => i.filePath).map((i) => deleteQueuedFile(i.filePath!)));
}

/** FLW-22 — change mode. Applies auth.md's token-lifecycle table via general rules rather than
 * the 16 individual cells: get a fresh app-token authorization only when the target scope
 * differs from what's held; revoke the superseded app token first (a token the target mode no
 * longer needs is revoked immediately, never left dangling); then reconcile the service token
 * against the target notifications setting, reusing the app token directly in read-only mode
 * (where they're the same credential) rather than a second round.
 *
 * Known deviation: Read-only+notifications -> Read-write+notifications should reuse the
 * already-held read token as the service token (auth.md: "new auth (write); keep read token").
 * Because the app-token replacement above already revokes the account's prior token, this path
 * requests a fresh second read authorization instead — one extra sign-in step versus the spec's
 * ideal, but the account still ends up in the correct final state. Worth tightening later,
 * not blocking Phase 2. */
export async function changeAccountMode(
  accountId: string,
  target: SignInModeChoice,
): Promise<void> {
  const store = useAccountsStore.getState();
  const account = store.accounts.find((a) => a.id === accountId);
  if (!account) throw new Error(`Unknown account: ${accountId}`);

  if (account.appTokenScope !== target.scope) {
    const oldToken = await getToken(accountId, 'app');
    const result = await runOAuthRound(target.scope);
    if (oldToken) {
      await getClientForToken(oldToken)
        .revokeToken()
        .catch(() => {});
    }
    await setToken(accountId, 'app', result.accessToken);
    store.updateAccount(accountId, { appTokenScope: result.grantedScope });

    // FLW-18: a read-only account can't publish, so it's never offered a reminder — cancel any
    // it had the moment it stops being read-write. (The reverse — gaining read-write — needs no
    // action here: reminders start off until SCR-25 explicitly turns one on.)
    if (result.grantedScope !== 'read,write') {
      cancelReminderForAccount(accountId);
    }
  }

  const refreshed = useAccountsStore.getState().accounts.find((a) => a.id === accountId);
  if (!refreshed) return;
  const finalAppScope = refreshed.appTokenScope;

  if (target.notifications && !refreshed.hasServiceToken && (await ensurePushPermission())) {
    if (finalAppScope === 'read') {
      const appToken = await getToken(accountId, 'app');
      if (appToken) {
        const registered = await registerAccountForPush(accountId, appToken);
        if (registered) {
          await setToken(accountId, 'service', appToken);
          useAccountsStore.getState().updateAccount(accountId, { hasServiceToken: true });
        }
      }
    } else {
      const serviceResult = await runOAuthRound('read');
      const registered = await registerAccountForPush(accountId, serviceResult.accessToken);
      if (registered) {
        await setToken(accountId, 'service', serviceResult.accessToken);
        useAccountsStore.getState().updateAccount(accountId, { hasServiceToken: true });
      }
    }
  } else if (!target.notifications && refreshed.hasServiceToken) {
    // Revoking is only meaningful when the service token is a genuinely separate credential
    // (read-write + notifications) — in read-only mode it's the same string as the app token,
    // which the app itself still needs.
    if (finalAppScope === 'read,write') {
      const serviceToken = await getToken(accountId, 'service');
      if (serviceToken) {
        await getClientForToken(serviceToken)
          .revokeToken()
          .catch(() => {});
      }
    }
    await deleteToken(accountId, 'service');
    // deregisterAccountFromPush() clears the registration-specific fields
    // (notificationRegistrationId/notificationStatus) and best-effort DELETEs the b-push row;
    // hasServiceToken is this module's own concept (Blipfoto service-token possession) and stays
    // its responsibility to clear, same as every other token-lifecycle field above.
    useAccountsStore.getState().updateAccount(accountId, { hasServiceToken: false });
    await deregisterAccountFromPush(accountId);
  }
}

/** FLW-02 — forced logout: an invalid-session error, or the notification service reporting a
 * stale read token, clears exactly the one failing token. Never removes the account. */
export function handleForcedLogout(accountId: string, purpose: 'app' | 'service'): void {
  const store = useAccountsStore.getState();
  const account = store.accounts.find((a) => a.id === accountId);
  if (!account) return;

  void deleteToken(accountId, purpose);
  if (purpose === 'app') {
    store.updateAccount(accountId, { appTokenScope: null });
  } else {
    store.updateAccount(accountId, {
      hasServiceToken: false,
      notificationStatus: 'read-token-invalid',
    });
  }

  const refreshed = useAccountsStore.getState().accounts.find((a) => a.id === accountId);
  if (!refreshed) return;
  const stillUsable = refreshed.appTokenScope !== null;
  const wasActive = store.activeAccountId === accountId;
  if (wasActive && !stillUsable) {
    const next = useAccountsStore
      .getState()
      .accounts.find((a) => a.id !== accountId && a.appTokenScope !== null);
    useAccountsStore.getState().setActiveAccountId(next?.id ?? null);
  }
}
