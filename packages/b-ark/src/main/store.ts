// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import Store from 'electron-store';
import type { AccountConfig, AppStore } from '@b-oss/b-ark-ui';

const defaults: AppStore = {
  accounts: [],
  ui: { thumbnailSizePercent: 100, accountOrder: [] },
  app: { startWithWindows: true },
};

export const store = new Store<AppStore>({ defaults, name: 'b-ark-config' });

export function getAccounts(): AccountConfig[] {
  return store.get('accounts');
}

export function getAccount(id: string): AccountConfig | undefined {
  return getAccounts().find((a) => a.id === id);
}

export function saveAccount(account: AccountConfig): void {
  const accounts = getAccounts().filter((a) => a.id !== account.id);
  accounts.push(account);
  store.set('accounts', accounts);
}

export function deleteAccount(id: string): void {
  store.set(
    'accounts',
    getAccounts().filter((a) => a.id !== id),
  );
}

export function getAppStore(): AppStore {
  return store.store;
}
