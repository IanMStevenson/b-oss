// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Single owner of the backup *lifecycle* keys in chrome.storage.local:
//   • `backup_lifecycle` — tracks the auto-launched background backup tab so the SW can
//     decide whether to silently close it on completion or raise it on error.
//   • `publish_pending`  — a one-shot flag set when a publish/save is detected while a
//     backup is already running, so another pass starts as soon as the current one ends.
//
// The service worker (sw.ts) and BrowserBackend both touch these keys; routing every
// read/write through here keeps the shape typed in one place (mirrors status-storage.ts).

const LIFECYCLE_KEY = 'backup_lifecycle';
const PUBLISH_PENDING_KEY = 'publish_pending';

export interface BackupLifecycle {
  tab_id: number;
  launched_by: 'visit-trigger' | 'user';
  started_at: string;
  user_adopted: boolean;
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
