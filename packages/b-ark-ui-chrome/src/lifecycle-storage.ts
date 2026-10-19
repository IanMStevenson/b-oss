// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Single owner of the backup *lifecycle* keys in chrome.storage.local:
//   • `backup_lifecycle` — tracks the auto-launched background backup tab so the SW can
//     decide whether to silently close it on completion or raise it on error.
//   • `publish_pending`  — a one-shot flag set when a publish/save is detected while a
//     backup is already running, so another pass starts as soon as the current one ends.
//   • `backup_tab_id`    — the id of the one canonical backup-page tab. The SW focuses this
//     tab instead of opening a duplicate, and validates it lazily with `tabs.get(id)` (this
//     replaces the old `tabs.query({ url })` so the `tabs` permission is no longer needed).
//   • `backup_lock`      — cross-tab guard: the tab currently running a BackupEngine. Prevents
//     two tabs writing the same FSA folder concurrently.
//   • `settings_lock`    — cross-tab guard: the tab with the settings panel open. Prevents two
//     panels racing read-modify-write on `b_ark_settings`.
//
// The service worker (sw.ts) and BrowserBackend both touch these keys; routing every
// read/write through here keeps the shape typed in one place (mirrors status-storage.ts).

const LIFECYCLE_KEY = 'backup_lifecycle';
const PUBLISH_PENDING_KEY = 'publish_pending';
const BACKUP_TAB_KEY = 'backup_tab_id';
const BACKUP_LOCK_KEY = 'backup_lock';
const SETTINGS_LOCK_KEY = 'settings_lock';

export interface BackupLifecycle {
  tab_id: number;
  launched_by: 'visit-trigger' | 'user';
  started_at: string;
  user_adopted: boolean;
}

export interface BackupLock {
  tab_id: number;
  started_at: string;
}

export interface SettingsLock {
  tab_id: number;
}

// ── backup_lifecycle ──────────────────────────────────────────────────────────

export async function readLifecycle(): Promise<BackupLifecycle | null> {
  const r = await chrome.storage.local.get(LIFECYCLE_KEY);
  return (r[LIFECYCLE_KEY] as BackupLifecycle | undefined) ?? null;
}

export async function saveLifecycle(lifecycle: BackupLifecycle): Promise<void> {
  await chrome.storage.local.set({ [LIFECYCLE_KEY]: lifecycle });
}

/** Merge a partial into the stored lifecycle. No-op (returns null) if none is stored. */
export async function updateLifecycle(
  partial: Partial<BackupLifecycle>,
): Promise<BackupLifecycle | null> {
  const current = await readLifecycle();
  if (!current) return null;
  const updated: BackupLifecycle = { ...current, ...partial };
  await chrome.storage.local.set({ [LIFECYCLE_KEY]: updated });
  return updated;
}

export async function clearLifecycle(): Promise<void> {
  await chrome.storage.local.remove(LIFECYCLE_KEY);
}

// ── publish_pending ─────────────────────────────────────────────────────────────

export async function setPublishPending(): Promise<void> {
  await chrome.storage.local.set({ [PUBLISH_PENDING_KEY]: true });
}

/** Read-and-clear the pending flag; returns whether a publish was pending. */
export async function consumePublishPending(): Promise<boolean> {
  const r = await chrome.storage.local.get(PUBLISH_PENDING_KEY);
  if (!r[PUBLISH_PENDING_KEY]) return false;
  await chrome.storage.local.remove(PUBLISH_PENDING_KEY);
  return true;
}

// ── backup_tab_id ─────────────────────────────────────────────────────────────

export async function readBackupTabId(): Promise<number | null> {
  const r = await chrome.storage.local.get(BACKUP_TAB_KEY);
  return (r[BACKUP_TAB_KEY] as number | undefined) ?? null;
}

export async function saveBackupTabId(tabId: number): Promise<void> {
  await chrome.storage.local.set({ [BACKUP_TAB_KEY]: tabId });
}

export async function clearBackupTabId(): Promise<void> {
  await chrome.storage.local.remove(BACKUP_TAB_KEY);
}

// ── backup_lock ───────────────────────────────────────────────────────────────

export async function readBackupLock(): Promise<BackupLock | null> {
  const r = await chrome.storage.local.get(BACKUP_LOCK_KEY);
  return (r[BACKUP_LOCK_KEY] as BackupLock | undefined) ?? null;
}

export async function acquireBackupLock(tabId: number, startedAt: string): Promise<void> {
  await chrome.storage.local.set({ [BACKUP_LOCK_KEY]: { tab_id: tabId, started_at: startedAt } });
}

/** Release the lock only if the given tab owns it (or no tab id is given). */
export async function releaseBackupLock(tabId?: number): Promise<void> {
  if (tabId !== undefined) {
    const current = await readBackupLock();
    if (current && current.tab_id !== tabId) return;
  }
  await chrome.storage.local.remove(BACKUP_LOCK_KEY);
}

// ── settings_lock ─────────────────────────────────────────────────────────────

export async function readSettingsLock(): Promise<SettingsLock | null> {
  const r = await chrome.storage.local.get(SETTINGS_LOCK_KEY);
  const lock = (r[SETTINGS_LOCK_KEY] as SettingsLock | undefined) ?? null;
  if (lock && !(await tabStillExists(lock.tab_id))) {
    // The owning tab was closed without a clean unmount (e.g. the browser tab was
    // closed directly rather than navigated away from), so releaseSettingsLock()
    // never ran and the lock would otherwise block every other tab's settings
    // button forever. Self-heal: a lock whose tab no longer exists is stale.
    await chrome.storage.local.remove(SETTINGS_LOCK_KEY);
    return null;
  }
  return lock;
}

async function tabStillExists(tabId: number): Promise<boolean> {
  try {
    await chrome.tabs.get(tabId);
    return true;
  } catch {
    return false;
  }
}

export async function acquireSettingsLock(tabId: number): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_LOCK_KEY]: { tab_id: tabId } });
}

/** Release the lock only if the given tab owns it (or no tab id is given). */
export async function releaseSettingsLock(tabId?: number): Promise<void> {
  if (tabId !== undefined) {
    const current = await readSettingsLock();
    if (current && current.tab_id !== tabId) return;
  }
  await chrome.storage.local.remove(SETTINGS_LOCK_KEY);
}
