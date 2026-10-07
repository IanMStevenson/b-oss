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
import { BlipfotoError } from '@b-oss/b-api';
import {
  getClientForToken,
  getClientForAccount,
  setAppTokenRejectedHandler,
} from '../data/client.js';
import {
  useAccountsStore,
  pushStreamsOf,
  hadNotifications,
  ALL_PUSH_STREAMS,
} from '../state/accountsStore.js';
import type { StoredAccount, PushStreams } from '../state/accountsStore.js';
import { useUploadQueueStore } from '../state/uploadQueueStore.js';
import { deleteQueuedFile } from '../platform/upload.js';
import { refreshAccountAvatar } from './avatarFlow.js';
import { runOAuthRound, OAuthCancelledError } from './oauthRound.js';
import type { OAuthResult } from './oauthRound.js';
import { AccountMismatchError, sameUsername } from './accountMismatch.js';
import { isNativePlatform } from '../platform/appState.js';
import { cancelReminderForAccount } from './reminderFlow.js';
import {
  ensurePushPermission,
  registerAccountForPush,
  deregisterAccountFromPush,
} from './pushFlow.js';

export { OAuthCancelledError, AccountMismatchError };

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
  void refreshAccountAvatar(account.id); // so the switcher shows their picture straight away
  return account;
}

/** b-oss#240: which browser a token change for an *existing* account uses (the notifications
 * read-only round, a scope change, Sign in again) when the caller doesn't say. With more than one
 * account on this device the system browser is quite likely logged in to Blipfoto as a different
 * one of them, so the clean in-app browser is forced; with a single account the system browser is
 * fine (and saves typing a password). The owner check in runRoundForAccount() applies either way. */
export function tokenChangeUsesEmbedded(): boolean {
  return isNativePlatform() && useAccountsStore.getState().accounts.length > 1;
}

/** Best-effort revoke of a token this app has no use for — unless the same string is already held
 * for some account here. Blipfoto might hand back an existing token for the same user and app,
 * and revoking a wrong-owner token must never sign out the account it actually belongs to. */
async function revokeUnlessHeld(token: string): Promise<void> {
  for (const account of useAccountsStore.getState().accounts) {
    for (const purpose of ['app', 'service'] as const) {
      if ((await getToken(account.id, purpose)) === token) return;
    }
  }
  await getClientForToken(token)
    .revokeToken()
    .catch(() => {
      // Best-effort — the token is discarded locally either way.
    });
}

/** One OAuth round whose token is meant for `expectedUsername` (b-oss#240). runOAuthRound has
 * already confirmed the token with `GET oauth/token`, which names its owner; if that isn't the
 * expected account the token is revoked (unless held — see revokeUnlessHeld), nothing is stored,
 * and AccountMismatchError says who it was for. */
async function runRoundForAccount(
  expectedUsername: string,
  scope: 'read' | 'read,write',
  options: { useEmbedded?: boolean },
): Promise<OAuthResult> {
  const result = await runOAuthRound(scope, options);
  if (!sameUsername(result.username, expectedUsername)) {
    await revokeUnlessHeld(result.accessToken);
    throw new AccountMismatchError(expectedUsername, result.username, options.useEmbedded === true);
  }
  return result;
}

/** Registers `token` with b-push for the account and, on success, keeps it as the service token.
 * b-push refusing the token as someone else's (pushFlow's AccountMismatchError, from its 403) is
 * rethrown after the token is revoked — unless it's the account's own app token (read-only mode,
 * where the two are the same credential), which revokeUnlessHeld leaves alone. */
async function registerServiceToken(
  accountId: string,
  token: string,
  streams: PushStreams,
): Promise<void> {
  let registered: boolean;
  try {
    registered = await registerAccountForPush(accountId, token, streams);
  } catch (err) {
    if (err instanceof AccountMismatchError) await revokeUnlessHeld(token);
    throw err;
  }
  if (registered) {
    await setToken(accountId, 'service', token);
    useAccountsStore.getState().updateAccount(accountId, { hasServiceToken: true });
  }
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
  /** Runs every OAuth round in this sign-in through the embedded WebView (oauthRound.ts) instead
   * of the system browser, forcing a fresh login — SCR-01's "force new sign-in" toggle, for
   * adding a second account without logging the system browser out of the first. In
   * changeAccountMode, omitted means tokenChangeUsesEmbedded() decides (b-oss#240). */
  useEmbedded?: boolean;
  /** Which push streams to register with when this turns notifications on (b-oss#244). Sign-in's
   * "Get notifications" means both. changeAccountMode defaults to the account's stored choice, so
   * "Sign in again" after a dead service token restores what the user had. */
  pushStreams?: PushStreams;
}

/** FLW-20 — deliberate sign-in with the full mode choice. Read-write + notifications runs two
 * sequential, separately-visible OAuth rounds (auth.md); a failed/cancelled second round keeps
 * the first token — the account signs in read-write, just without notifications.
 *
 * Push permission is checked *before* either round runs for notifications (rules.md: never
 * authorize something already known to be undeliverable) — a refusal skips the whole
 * notifications branch, including the second interactive OAuth round for read-write, rather than
 * asking the user through a sign-in step for a feature that can't be delivered. */
export interface SignInHooks {
  /** Called right before the second (read-only, notification-service) OAuth round that Read-write
   * + notifications needs. Resolve `false` to skip it — signed in read-write, no notifications —
   * so the screen can explain why the user is about to be asked to sign in again, instead of the
   * second round appearing out of nowhere and looking like a failure. Omitted: proceeds.
   * changeAccountMode takes the same hook for SCR-25's enable path. */
  beforeServiceRound?: () => Promise<boolean>;
}

export async function signInDeliberate(
  choice: SignInModeChoice,
  hooks: SignInHooks = {},
): Promise<string> {
  const embedded = { useEmbedded: choice.useEmbedded };
  const result = await runOAuthRound(choice.scope, embedded);
  const account = await storeAppToken(result);
  useAccountsStore.getState().setActiveAccountId(account.id);

  if (choice.notifications && (await ensurePushPermission())) {
    if (account.appTokenScope === 'read') {
      // Read-only + notifications: the same token serves both — no second round.
      await registerServiceToken(
        account.id,
        result.accessToken,
        choice.pushStreams ?? ALL_PUSH_STREAMS,
      );
    } else if (!hooks.beforeServiceRound || (await hooks.beforeServiceRound())) {
      try {
        // The second round is for the account the first one just signed in (b-oss#240): same
        // browser as the first round, owner-checked. A mismatch is rethrown — the account stays
        // signed in read-write without notifications, and SCR-01 offers a retry in the app.
        const serviceResult = await runRoundForAccount(account.username, 'read', embedded);
        await registerServiceToken(
          account.id,
          serviceResult.accessToken,
          choice.pushStreams ?? ALL_PUSH_STREAMS,
        );
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
  hooks: SignInHooks = {},
): Promise<void> {
  const store = useAccountsStore.getState();
  const account = store.accounts.find((a) => a.id === accountId);
  if (!account) throw new Error(`Unknown account: ${accountId}`);
  // b-oss#240: every round below is for this existing account, so each is owner-checked, and the
  // browser defaults by account count unless the caller chose (e.g. the mismatch retry forces the
  // clean in-app browser).
  const round = { useEmbedded: target.useEmbedded ?? tokenChangeUsesEmbedded() };

  if (account.appTokenScope !== target.scope) {
    const oldToken = await getToken(accountId, 'app');
    const result = await runRoundForAccount(account.username, target.scope, round);
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
  const streams = target.pushStreams ?? pushStreamsOf(refreshed);

  if (target.notifications && !refreshed.hasServiceToken && (await ensurePushPermission())) {
    if (finalAppScope === 'read') {
      const appToken = await getToken(accountId, 'app');
      if (appToken) await registerServiceToken(accountId, appToken, streams);
    } else if (!hooks.beforeServiceRound || (await hooks.beforeServiceRound())) {
      // The hook is SCR-25's "One more sign-in" explainer; declining it changes nothing.
      const serviceResult = await runRoundForAccount(refreshed.username, 'read', round);
      await registerServiceToken(accountId, serviceResult.accessToken, streams);
    }
  } else if (!target.notifications && refreshed.hasServiceToken) {
    await clearServiceToken(accountId, finalAppScope);
  }
}

/** Notifications off for good: the service token revoked and deleted, hasServiceToken cleared, the
 * b-push registration deregistered. Shared by changeAccountMode and the launch check that finds
 * the OS permission withdrawn, which FLW-22 treats as the same event (b-oss#251). */
export async function clearServiceToken(
  accountId: string,
  appTokenScope: StoredAccount['appTokenScope'],
): Promise<void> {
  // Revoking is only meaningful when the service token is a genuinely separate credential
  // (read-write + notifications) — in read-only mode it's the same string as the app token,
  // which the app itself still needs.
  if (appTokenScope === 'read,write') {
    const serviceToken = await getToken(accountId, 'service');
    if (serviceToken) {
      await getClientForToken(serviceToken)
        .revokeToken()
        .catch(() => {});
    }
  }
  await deleteToken(accountId, 'service');
  // deregisterAccountFromPush() clears the registration-specific fields
  // (notificationRegistrationId/notificationStatus/streams) and best-effort DELETEs the b-push
  // row; hasServiceToken is this module's own concept (Blipfoto service-token possession) and
  // stays its responsibility to clear, same as every other token-lifecycle field above.
  useAccountsStore.getState().updateAccount(accountId, { hasServiceToken: false });
  await deregisterAccountFromPush(accountId);
}

/** FLW-02 — forced logout: an invalid-session error, or the notification service reporting a
 * stale read token, clears exactly the one failing token. Never removes the account. */
export function handleForcedLogout(accountId: string, purpose: 'app' | 'service'): void {
  const store = useAccountsStore.getState();
  const account = store.accounts.find((a) => a.id === accountId);
  if (!account) return;

  void deleteToken(accountId, purpose);
  if (purpose === 'app') {
    // Remember the mode so signing in again doesn't ask for it (b-oss#263).
    const lastAppTokenScope = account.appTokenScope ?? account.lastAppTokenScope;
    store.updateAccount(accountId, { appTokenScope: null, lastAppTokenScope });
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

// Every call made with an account's app token reports a rejected token here (data/client.ts), so
// a token revoked on blipfoto.com puts the account into needs-reauth wherever it's first noticed,
// not only in the upload queue (b-oss#261).
setAppTokenRejectedHandler((accountId) => handleForcedLogout(accountId, 'app'));

export interface ReauthorizeOptions {
  /** Which browser the rounds use; omitted means tokenChangeUsesEmbedded() decides (b-oss#240).
   * The wrong-account retry forces the clean in-app browser. */
  useEmbedded?: boolean;
  /** "One more sign-in" (b-oss#263): called after the app sign-in and right before the separate
   * notifications round a read-write account needs. Resolve `false` (Not now) to leave the
   * account signed in with notifications still needing a sign-in. Omitted: proceeds. */
  beforeServiceRound?: () => Promise<boolean>;
}

/** FLW-02 recovery (b-oss#263) — the one path for signing an account in again, whichever token
 * died. Every entry point (Accounts row, its Sign in again button, the header switcher, the
 * reauth-required push) ends up here.
 *
 * 1. Notifications-only (app token held, service token reported dead): check the app token first.
 *    Revoking b-mobile on blipfoto.com kills every token it holds, so a dead service token usually
 *    means a dead app token too; if so the account drops into needs-reauth (b-oss#261).
 * 2. App token dead: one app-token round at the scope the account had (`lastAppTokenScope`, kept
 *    by handleForcedLogout), owner-checked, via changeAccountMode. Its service token is settled
 *    first so the notifications part below knows whether it still works — read-only accounts'
 *    service token *is* the dead app token; a read-write account's is checked with one call.
 *    The account becomes active as soon as the app sign-in succeeds.
 * 3. If the account had notifications on and they now need a sign-in, changeAccountMode's enable
 *    path turns them back on with the streams it had: the `beforeServiceRound` explainer, then
 *    the read-only round, for read-write; the new app token directly, for read-only. Cancelling
 *    that round (or Not now) leaves the account signed in, notifications needing a sign-in.
 *
 * Resolves `signedIn: true` if a sign-in actually took (app token, or notifications back on).
 * Throws OAuthCancelledError if the app round is cancelled (nothing changed) and
 * AccountMismatchError from either round; after a notifications-round mismatch the account is
 * already signed in, so retrying runs only the notifications part. */
export async function reauthorizeAccount(
  accountId: string,
  options: ReauthorizeOptions = {},
): Promise<{ signedIn: boolean }> {
  const find = () => useAccountsStore.getState().accounts.find((a) => a.id === accountId);
  const initial = find();
  if (!initial) throw new Error(`Unknown account: ${accountId}`);
  const useEmbedded = options.useEmbedded ?? tokenChangeUsesEmbedded();

  if (initial.appTokenScope !== null) await checkAppToken(accountId);

  let signedIn = false;
  const beforeAppRound = find();
  if (!beforeAppRound) return { signedIn };
  if (beforeAppRound.appTokenScope === null) {
    await settleServiceTokenAfterAppDeath(beforeAppRound);
    const settled = find();
    if (!settled) return { signedIn };
    // notifications = whatever is held, so this call only replaces the app token and never
    // touches the service side (that's step 3's job, with its own explainer).
    await changeAccountMode(
      accountId,
      {
        scope: settled.lastAppTokenScope ?? 'read,write',
        notifications: settled.hasServiceToken,
        useEmbedded,
      },
      {},
    );
    useAccountsStore.getState().setActiveAccountId(accountId);
    signedIn = true;
  }

  const appSignedIn = find();
  if (!appSignedIn || appSignedIn.appTokenScope === null) return { signedIn };
  useAccountsStore.getState().setActiveAccountId(accountId);
  if (appSignedIn.hasServiceToken || !hadNotifications(appSignedIn)) return { signedIn };
  try {
    await changeAccountMode(
      accountId,
      { scope: appSignedIn.appTokenScope, notifications: true, useEmbedded },
      { beforeServiceRound: options.beforeServiceRound },
    );
  } catch (err) {
    // Cancelling the notifications round is the same as Not now: signed in, notifications off.
    if (!(err instanceof OAuthCancelledError)) throw err;
  }
  return { signedIn: signedIn || find()?.hasServiceToken === true };
}

/** Step 2 of reauthorizeAccount: before re-signing in an account whose app token died, decide
 * whether its service token still works. Read-only: it's the same credential, so it's dead.
 * Read-write: one cheap call; a rejection marks it dead (as b-push's report would), anything else
 * (offline) leaves it for the service to judge later. */
async function settleServiceTokenAfterAppDeath(account: StoredAccount): Promise<void> {
  if (!account.hasServiceToken) return;
  if (account.lastAppTokenScope === 'read') {
    handleForcedLogout(account.id, 'service');
    return;
  }
  try {
    const client = await getClientForAccount(account.id, 'service');
    await client.verifyToken(import.meta.env.VITE_BLIPFOTO_CLIENT_ID ?? '');
  } catch (err) {
    if (err instanceof BlipfotoError && err.isTokenInvalid) {
      handleForcedLogout(account.id, 'service');
    }
  }
}

/** FLW-02 recovery for a dead notification read token — now just reauthorizeAccount, which
 * checks the app token first (b-oss#261) and re-authorizes the whole account if that died too. */
export async function recoverNotifications(
  accountId: string,
  options: ReauthorizeOptions = {},
): Promise<{ signedIn: boolean }> {
  return reauthorizeAccount(accountId, options);
}

/** One cheap call with the app token; a rejection drops the account into needs-reauth. Anything
 * else (offline, say) is left for the sign-in that follows to surface. */
async function checkAppToken(accountId: string): Promise<void> {
  try {
    const client = await getClientForAccount(accountId, 'app');
    await client.verifyToken(import.meta.env.VITE_BLIPFOTO_CLIENT_ID ?? '');
  } catch (err) {
    if (err instanceof BlipfotoError && err.isTokenInvalid) handleForcedLogout(accountId, 'app');
  }
}
