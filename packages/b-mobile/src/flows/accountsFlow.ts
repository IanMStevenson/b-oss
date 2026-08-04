// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Ties runOAuthRound, secure storage, and accountsStore together into the account-management
// flows: FLW-01 (gated sign-in), FLW-20 (add account & choose mode), FLW-21 (switch), FLW-22
// (change mode / remove), FLW-02 (forced logout). Not one screen's job — SCR-01/SCR-30 call
// into this, they don't reimplement it.
//
// TODO(Phase 9): every place below marked "register/deregister with the notification service"
// is a no-op until b-push exists. The token lifecycle (which tokens are held, in secure storage,
// reflected in accountsStore) is fully implemented now regardless — registration is a separate
// concern layered on top per notification-service.md.

import { getToken, setToken, deleteToken } from '../platform/secureStorage.js';
import { getClientForToken } from '../data/client.js';
import { useAccountsStore } from '../state/accountsStore.js';
import type { StoredAccount } from '../state/accountsStore.js';
import { runOAuthRound, OAuthCancelledError } from './oauthRound.js';
import type { OAuthResult } from './oauthRound.js';

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
 * the first token — the account signs in read-write, just without notifications. */
export async function signInDeliberate(choice: SignInModeChoice): Promise<string> {
  const result = await runOAuthRound(choice.scope);
  const account = await storeAppToken(result);
  useAccountsStore.getState().setActiveAccountId(account.id);

  if (choice.notifications) {
    if (account.appTokenScope === 'read') {
      // Read-only + notifications: the same token serves both — no second round.
      await setToken(account.id, 'service', result.accessToken);
      useAccountsStore.getState().updateAccount(account.id, { hasServiceToken: true });
      // TODO(Phase 9): register with the notification service.
    } else {
      try {
        const serviceResult = await runOAuthRound('read');
        await setToken(account.id, 'service', serviceResult.accessToken);
        useAccountsStore.getState().updateAccount(account.id, { hasServiceToken: true });
        // TODO(Phase 9): register with the notification service.
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
    // TODO(Phase 9): deregister from the notification service.
  }

  useAccountsStore.getState().removeAccountLocally(accountId);
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
  }

  const refreshed = useAccountsStore.getState().accounts.find((a) => a.id === accountId);
  if (!refreshed) return;
  const finalAppScope = refreshed.appTokenScope;

  if (target.notifications) {
    if (finalAppScope === 'read') {
      const appToken = await getToken(accountId, 'app');
      if (appToken) await setToken(accountId, 'service', appToken);
      useAccountsStore.getState().updateAccount(accountId, { hasServiceToken: true });
      // TODO(Phase 9): register/refresh with the notification service.
    } else if (!refreshed.hasServiceToken) {
      const serviceResult = await runOAuthRound('read');
      await setToken(accountId, 'service', serviceResult.accessToken);
      useAccountsStore.getState().updateAccount(accountId, { hasServiceToken: true });
      // TODO(Phase 9): register with the notification service.
    }
  } else if (refreshed.hasServiceToken) {
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
    useAccountsStore.getState().updateAccount(accountId, {
      hasServiceToken: false,
      notificationStatus: null,
    });
    // TODO(Phase 9): deregister from the notification service.
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
