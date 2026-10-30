// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Notifications on the desktop (capabilities().notifications.mechanism === 'polling', b-oss#610).
// There is no notification service, no second token and no registration: the shell polls with the
// account's single app token, so "notifications on" is only a setting. It lives in the existing
// account fields: `hasServiceToken` is true while notifications are on (no service token is ever
// stored on desktop; the name is historical) and `pushComments`/`pushNotifications` are the two
// streams. A dead app token needs no special state here: the account is already "needs sign-in"
// through `appTokenScope === null`, and the shell is simply not told to watch it.

import { useAccountsStore, pushStreamsOf } from '../state/accountsStore.js';
import type { PushStreams } from '../state/accountsStore.js';
import { configureDesktopNotifications } from '../platform/desktopNotify.js';
import type { DesktopNotifySettings } from '../platform/desktopNotify.js';
import { capabilities } from '../platform/capabilities.js';

export function usesPolling(): boolean {
  return capabilities().notifications.mechanism === 'polling';
}

/** Turns notifications on for the account with the given streams (both off is "off"). */
export function enablePollingNotifications(accountId: string, streams: PushStreams): void {
  if (!streams.comments && !streams.notifications) {
    disablePollingNotifications(accountId);
    return;
  }
  useAccountsStore.getState().updateAccount(accountId, {
    hasServiceToken: true,
    pushComments: streams.comments,
    pushNotifications: streams.notifications,
  });
}

export function disablePollingNotifications(accountId: string): void {
  useAccountsStore.getState().updateAccount(accountId, {
    hasServiceToken: false,
    pushComments: undefined,
    pushNotifications: undefined,
  });
}

/** What the shell should watch: accounts with notifications on and a usable app token. */
export function pollingSettings(): DesktopNotifySettings {
  return {
    accounts: useAccountsStore
      .getState()
      .accounts.filter((a) => a.hasServiceToken && a.appTokenScope !== null)
      .map((a) => ({ accountId: a.id, streams: pushStreamsOf(a) })),
  };
}

/** Keeps the shell's watched set in step with the accounts store: once on start-up (after the
 * store has loaded) and again whenever it changes. Returns the unsubscribe. */
export function startPollingSync(hydrated: Promise<unknown>): () => void {
  let last = '';
  let ready = false;
  const push = (): void => {
    if (!ready) return;
    const settings = pollingSettings();
    const key = JSON.stringify(settings);
    if (key === last) return;
    last = key;
    void configureDesktopNotifications(settings).catch(() => {
      // Retry on the next change; forgetting the key makes an identical state send again.
      last = '';
    });
  };
  const unsubscribe = useAccountsStore.subscribe(push);
  void hydrated.then(() => {
    ready = true;
    push();
  });
  return unsubscribe;
}
