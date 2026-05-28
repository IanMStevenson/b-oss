// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import Store from 'electron-store';
import type {
  AccountConfig,
  AccountStatus,
  AppStore,
  BArkSettings,
  PortableAccount,
  UserDataStore,
} from '@b-oss/b-ark-ui';
import { PortableSettingsManager } from './portable-settings.js';

const DEFAULT_STATUS: AccountStatus = {
  last_backup_at: null,
  total_archived: 0,
  journal_entry_total: 0,
  rag_state: 'amber',
  error_message: null,
  account_added_at: null,
};

const localDefaults: UserDataStore = {
  schema_version: 2,
  backup_folder: '',
  app: { startWithWindows: true, autoUpdateEnabled: true },
  tokens: {},
  status: {},
};

export const store = new Store<UserDataStore>({ defaults: localDefaults, name: 'b-ark-config' });

/**
 * Fill in any missing `app.*` keys on the persisted store. electron-store only
 * applies `defaults` to top-level missing keys, so when we add a new nested
 * field (e.g. `app.autoUpdateEnabled`) existing installs would read it as
 * `undefined`. Call once at startup, after migrateFromV1IfNeeded().
 */
export function ensureAppDefaults(): void {
  const current = store.get('app') as Partial<UserDataStore['app']> | undefined;
  const merged: UserDataStore['app'] = {
    startWithWindows: current?.startWithWindows ?? localDefaults.app.startWithWindows,
    autoUpdateEnabled: current?.autoUpdateEnabled ?? localDefaults.app.autoUpdateEnabled,
  };
  store.set('app', merged);
}

// Lazy-bound portable manager. Cache is always populated (starts at defaults)
// so account operations work before the user has picked a folder; pending
// writes flush to disk when bindBackupFolder() is later called.
let portableManager: PortableSettingsManager | null = null;
let portableCache: BArkSettings = PortableSettingsManager.defaults();

export function getBackupFolder(): string {
  return store.get('backup_folder');
}

/**
 * Startup hook: if the user data store has a remembered backup_folder, bind
 * the portable manager to it (loading the file if present, creating defaults
 * otherwise). No-op if no folder is set yet — the picker will call
 * bindBackupFolder() later.
 *
 * Call AFTER migrateFromV1IfNeeded(), so the freshly-migrated cache isn't
 * overwritten when the migration already wrote the portable file.
 */
export async function loadPortableFromStoredFolder(): Promise<void> {
  if (portableManager !== null) return; // migration already bound us
  const folder = store.get('backup_folder');
  if (!folder) return;
  await bindBackupFolder(folder);
}

/**
 * Bind the portable manager to a folder. If a settings file already exists in
 * the folder, adopt its contents (replacing the in-memory cache). Otherwise,
 * write the current in-memory cache to the folder as the initial file.
 * Returns whether an existing file was adopted.
 */
export async function bindBackupFolder(folder: string): Promise<{ existing: boolean }> {
  store.set('backup_folder', folder);
  const mgr = new PortableSettingsManager(folder);
  let existing: boolean;
  if (await mgr.fileExists()) {
    portableCache = await mgr.load();
    existing = true;
  } else {
    await mgr.save(portableCache);
    existing = false;
  }
  portableManager = mgr;
  return { existing };
}

/**
 * Used by the v1→v2 migration to seed the in-memory cache (and the manager,
 * if a folder is known) without a separate read/write — the migration writes
 * the portable file itself.
 */
export function adoptPortable(folder: string, settings: BArkSettings): void {
  portableManager = folder ? new PortableSettingsManager(folder) : null;
  portableCache = settings;
}

export function getPortableSettings(): BArkSettings {
  return portableCache;
}

export async function savePortableSettings(next: BArkSettings): Promise<void> {
  portableCache = next;
  if (portableManager !== null) {
    await portableManager.save(next);
  }
}

export function getStatus(id: string): AccountStatus {
  return store.get('status')[id] ?? DEFAULT_STATUS;
}

export function setStatus(id: string, partial: Partial<AccountStatus>): void {
  const all = store.get('status');
  const current = all[id] ?? DEFAULT_STATUS;
  store.set('status', { ...all, [id]: { ...current, ...partial } });
}

export function deleteStatus(id: string): void {
  const all = { ...store.get('status') };
  delete all[id];
  store.set('status', all);
}

export function getWorstRag(): 'green' | 'amber' | 'red' | null {
  const ids = getPortableSettings().account_order;
  if (!ids.length) return null;
  const statuses = store.get('status');
  let worst: 'green' | 'amber' | 'red' = 'green';
  for (const id of ids) {
    const rag = (statuses[id] ?? DEFAULT_STATUS).rag_state;
    if (rag === 'red') return 'red';
    if (rag === 'amber') worst = 'amber';
  }
  return worst;
}

export function getToken(username: string): string | null {
  return store.get('tokens')[username] ?? null;
}

export function setToken(username: string, encrypted: string): void {
  const all = store.get('tokens');
  store.set('tokens', { ...all, [username]: encrypted });
}

export function deleteToken(username: string): void {
  const all = { ...store.get('tokens') };
  delete all[username];
  store.set('tokens', all);
}

// ---------------------------------------------------------------------------
// Backward-compatible facade — composes the legacy AccountConfig + AppStore
// shapes from the new split storage. Kept stable for Phase 1 so the renderer
// and existing IPC surface continue to work without changes.
// ---------------------------------------------------------------------------

function composeAccountConfig(p: PortableAccount): AccountConfig {
  const settings = portableCache;
  const status = getStatus(p.id);
  const token = getToken(p.username) ?? '';
  return {
    id: p.id,
    username: p.username,
    journal_title: p.journal_title,
    avatar_url: p.avatar_url,
    access_token: token,
    backup_folder: getBackupFolder(),
    schedule: settings.schedule,
    api_delay_ms: settings.api_delay_ms,
    gap_check_days: settings.gap_check_days,
    redo_count: settings.redo_count,
    last_backup_at: status.last_backup_at,
    total_archived: status.total_archived,
    journal_entry_total: status.journal_entry_total,
    rag_state: status.rag_state,
    error_message: status.error_message,
    account_added_at: status.account_added_at,
  };
}

export function getAccounts(): AccountConfig[] {
  return portableCache.accounts.map(composeAccountConfig);
}

export function getAccount(id: string): AccountConfig | undefined {
  const p = portableCache.accounts.find((a) => a.id === id);
  return p ? composeAccountConfig(p) : undefined;
}

/**
 * Write a full AccountConfig back to the underlying split stores. Identity
 * fields go to the portable accounts list; token to local tokens; status
 * fields to local status; shared fields (schedule/delay/gap/redo) to portable
 * shared settings. Note that writing a shared field on any account updates
 * the shared value for *all* accounts — this matches the new shared model.
 * backup_folder on the partial is ignored here; callers must use
 * bindBackupFolder() to change it.
 */
export async function saveAccount(account: AccountConfig): Promise<void> {
  const portableAcct: PortableAccount = {
    id: account.id,
    username: account.username,
    journal_title: account.journal_title,
    avatar_url: account.avatar_url,
  };

  const existing = portableCache.accounts.find((a) => a.id === account.id);
  const nextAccounts = existing
    ? portableCache.accounts.map((a) => (a.id === account.id ? portableAcct : a))
    : [...portableCache.accounts, portableAcct];

  const nextOrder = portableCache.account_order.includes(account.id)
    ? portableCache.account_order
    : [...portableCache.account_order, account.id];

  const nextSettings: BArkSettings = {
    ...portableCache,
    accounts: nextAccounts,
    account_order: nextOrder,
    schedule: account.schedule,
    api_delay_ms: account.api_delay_ms,
    gap_check_days: account.gap_check_days,
    redo_count: account.redo_count,
  };

  await savePortableSettings(nextSettings);

  if (account.access_token) {
    setToken(account.username, account.access_token);
  }

  setStatus(account.id, {
    last_backup_at: account.last_backup_at,
    total_archived: account.total_archived,
    journal_entry_total: account.journal_entry_total,
    rag_state: account.rag_state,
    error_message: account.error_message,
    account_added_at: account.account_added_at,
  });
}

export async function deleteAccount(id: string): Promise<void> {
  const target = portableCache.accounts.find((a) => a.id === id);
  const nextSettings: BArkSettings = {
    ...portableCache,
    accounts: portableCache.accounts.filter((a) => a.id !== id),
    account_order: portableCache.account_order.filter((x) => x !== id),
  };
  await savePortableSettings(nextSettings);
  deleteStatus(id);
  if (target) {
    const usernameStillReferenced = nextSettings.accounts.some(
      (a) => a.username === target.username,
    );
    if (!usernameStillReferenced) {
      deleteToken(target.username);
    }
  }
}

export function getAppStore(): AppStore {
  return {
    accounts: getAccounts(),
    ui: {
      thumbnailSizePercent: portableCache.ui.thumbnail_size_percent,
      accountOrder: [...portableCache.account_order],
      showInfoOverlay: portableCache.ui.show_info_overlay,
    },
    app: store.get('app'),
  };
}

/**
 * Update the in-memory and on-disk account_order. Used by addAccount /
 * removeAccount and (eventually) drag-reorder UI.
 */
export async function setAccountOrder(order: string[]): Promise<void> {
  await savePortableSettings({ ...portableCache, account_order: order });
}

/**
 * Used by the migration to set status entries directly without round-tripping
 * through setStatus (which would touch each key one at a time).
 */
export function setAllStatus(status: Record<string, AccountStatus>): void {
  store.set('status', status);
}

export function setAllTokens(tokens: Record<string, string>): void {
  store.set('tokens', tokens);
}

/**
 * Remove legacy v1 keys from the userData store after migration.
 */
export function clearLegacyKeys(): void {
  // electron-store does not expose a direct "delete unknown key" API; use the
  // internal store object accessor.
  const raw = store.store as unknown as Record<string, unknown>;
  delete raw['accounts'];
  delete raw['ui'];
  // schema_version handles the rest of identification.
  store.store = raw as unknown as UserDataStore;
}
