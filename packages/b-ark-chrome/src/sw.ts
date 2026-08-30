// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { startOAuthFlow } from './oauth.js';
import {
  type BackupLifecycle,
  readLifecycle,
  saveLifecycle,
  updateLifecycle,
  clearLifecycle,
  setPublishPending,
  consumePublishPending,
  readBackupTabId,
  saveBackupTabId,
  clearBackupTabId,
  readBackupLock,
  releaseBackupLock,
  readSettingsLock,
  releaseSettingsLock,
} from '@b-oss/b-ark-ui-chrome/src/lifecycle-storage.js';

const CLIENT_ID = import.meta.env.VITE_CHROME_CLIENT_ID ?? '';
const BACKUP_PAGE = 'src/backup-page.html';

// ── Inline types (mirrors b-ark-ui-chrome to avoid a cross-package dep) ──────

type RagState = 'green' | 'amber' | 'red';

interface ChromeStatus {
  last_backup_at: string | null;
  rag_state: RagState;
}

interface ChromeSettings {
  period: 'daily' | 'weekly';
  schedule_enabled?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isPeriodDue(lastBackupAt: string | null, period: 'daily' | 'weekly'): boolean {
  if (!lastBackupAt) return true;
  const ms = period === 'daily' ? 86_400_000 : 7 * 86_400_000;
  return Date.now() - new Date(lastBackupAt).getTime() >= ms;
}

/**
 * True only when a backup is genuinely in progress: amber + a progress cursor, *and* a live
 * tab is actually driving it. Without the live-tab check, a run that crashed mid-way (leaving
 * chip_rag/chip_progress stuck) would look "running" forever and permanently block every
 * future auto-trigger — see the b-ark-chrome "stuck at 0/1" incident this guards against.
 */
export function isBackupStillRunning(
  rag: RagState,
  progress: { done: number; total: number } | null | undefined,
  liveBackupTabId: number | null,
): boolean {
  return rag === 'amber' && progress != null && liveBackupTabId !== null;
}

function getBackupPageUrl(): string {
  return chrome.runtime.getURL(BACKUP_PAGE);
}

/**
 * Return the id of the canonical backup tab if it still exists.
 * Validates `backup_tab_id` with `tabs.get` (no `tabs` permission needed); a stale id
 * self-heals here, clearing both the tracked id and any lifecycle that referenced it.
 */
export async function getLiveBackupTabId(): Promise<number | null> {
  const id = await readBackupTabId();
  if (id === null) return null;
  try {
    await chrome.tabs.get(id);
    return id;
  } catch {
    // Tab is gone — clean up stale tracking
    await clearBackupTabId();
    await clearLifecycle();
    return null;
  }
}

/** Focus an existing tab and raise its window. */
async function focusTab(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  await chrome.tabs.update(tabId, { active: true });
  if (tab.windowId !== undefined) {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
}

// ── Tab management ────────────────────────────────────────────────────────────

async function openOrFocusBackupPage(): Promise<void> {
  const id = await getLiveBackupTabId();
  if (id !== null) {
    await focusTab(id);
    return;
  }
  const tab = await chrome.tabs.create({ url: getBackupPageUrl(), active: true });
  if (tab.id !== undefined) await saveBackupTabId(tab.id);
}

/** Open the backup page as an unfocused background tab (singleton). */
async function launchBackupTabSilent(): Promise<void> {
  const url = getBackupPageUrl();
  const tab = await chrome.tabs.create({ url, active: false });
  if (!tab.id) return;
  await saveBackupTabId(tab.id);
  const lifecycle: BackupLifecycle = {
    tab_id: tab.id,
    launched_by: 'visit-trigger',
    started_at: new Date().toISOString(),
    user_adopted: false,
  };
  await saveLifecycle(lifecycle);
}

/**
 * Arbitrate the singleton when a backup page reports for duty on mount.
 * If no live canonical tab exists (or it's this very tab), this tab becomes canonical.
 * Otherwise this is a duplicate (session-restore / manual duplicate): focus the canonical
 * tab and close the duplicate. Centralized here so the page needs no `window.close`.
 */
export async function claimBackupTab(tabId: number): Promise<void> {
  const live = await getLiveBackupTabId();
  if (live === null || live === tabId) {
    await saveBackupTabId(tabId);
    return;
  }
  await focusTab(live);
  try {
    await chrome.tabs.remove(tabId);
  } catch {
    // Already closed
  }
}

// ── Visit-trigger logic ───────────────────────────────────────────────────────

/**
 * Called by the chip content script on every Blipfoto page visit.
 * Decides whether to auto-launch the backup page as a silent background tab.
 */
export async function triggerIfDue(): Promise<void> {
  const r = await chrome.storage.local.get([
    'tokenCiphertext',
    'folder_ready',
    'b_ark_status',
    'b_ark_settings',
    'chip_rag',
    'chip_progress',
  ]);

  // Not set up — skip
  if (!r['tokenCiphertext'] || !r['folder_ready']) return;

  const rag = (r['chip_rag'] as RagState | undefined) ?? 'green';
  const progress = r['chip_progress'] as { done: number; total: number } | null | undefined;

  // Singleton check — backup tab already open
  const existingTabId = await getLiveBackupTabId();

  if (isBackupStillRunning(rag, progress, existingTabId)) return;
  if (existingTabId !== null) return;

  if (rag === 'red') {
    // Error needing user intervention — raise a focused tab
    await openOrFocusBackupPage();
    return;
  }

  if (rag === 'amber') {
    // Incomplete backup — resume silently
    await launchBackupTabSilent();
    return;
  }

  // Green: check whether the configured period has elapsed since last completion
  const status = (r['b_ark_status'] ?? {}) as Partial<ChromeStatus>;
  const settings = (r['b_ark_settings'] ?? {}) as Partial<ChromeSettings>;
  const period = settings.period ?? 'weekly';
  const scheduleEnabled = settings.schedule_enabled ?? true;

  if (scheduleEnabled && isPeriodDue(status.last_backup_at ?? null, period)) {
    await launchBackupTabSilent();
  }
}

// ── Publish-trigger logic ─────────────────────────────────────────────────────

/**
 * Called when the user clicks Publish or Save changes on a Blipfoto entry page.
 * If a backup is already running (or a tab is already open), sets a pending flag
 * so that another pass starts as soon as the current one finishes.
 */
export async function publishDetected(): Promise<void> {
  const r = await chrome.storage.local.get([
    'tokenCiphertext',
    'folder_ready',
    'chip_rag',
    'chip_progress',
  ]);

  if (!r['tokenCiphertext'] || !r['folder_ready']) return;

  const rag = (r['chip_rag'] as RagState | undefined) ?? 'green';
  const progress = r['chip_progress'] as { done: number; total: number } | null | undefined;

  const existingTabId = await getLiveBackupTabId();

  if (isBackupStillRunning(rag, progress, existingTabId) || existingTabId !== null) {
    await setPublishPending();
    return;
  }

  await launchBackupTabSilent();
}

// ── Lifecycle handlers (called by the backup page) ────────────────────────────

/**
 * Raise the backup tab + focus its window so the user sees the error.
 * Called by the backup page whenever a backup fails (never silent on error).
 */
export async function raiseBackupTab(): Promise<void> {
  const lifecycle = await readLifecycle();

  if (lifecycle?.tab_id) {
    try {
      const tab = await chrome.tabs.get(lifecycle.tab_id);
      await chrome.tabs.update(lifecycle.tab_id, { active: true });
      if (tab.windowId !== undefined) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      // Raising counts as adoption — user is now looking at it
      await updateLifecycle({ user_adopted: true });
      return;
    } catch {
      // Tab gone; fall through to openOrFocus
    }
  }
  // No tracked tab — open a focused one
  await openOrFocusBackupPage();
}

/**
 * Close the backup tab if the user never adopted it (i.e., they never focused it).
 * Called by the backup page on successful completion.
 */
export async function closeBackupTab(): Promise<void> {
  const lifecycle = await readLifecycle();

  if (lifecycle?.launched_by === 'visit-trigger' && !lifecycle.user_adopted) {
    try {
      await chrome.tabs.remove(lifecycle.tab_id);
    } catch {
      // Already closed
    }
    // Tab is gone — drop the singleton tracking (the onRemoved listener also covers this)
    await clearBackupTabId();
  }
  await clearLifecycle();

  // If a publish was detected while the backup was running, start another pass.
  if (await consumePublishPending()) {
    await launchBackupTabSilent();
  }
}

/**
 * Mark the lifecycle's tab as adopted (user focused it).
 * Called by BrowserBackend when window focus fires inside the backup page.
 */
async function markTabAdopted(): Promise<void> {
  await updateLifecycle({ user_adopted: true });
}

/**
 * A backup tab closed — drop it from the singleton tracking and release any cross-tab
 * locks it held (a backup or settings panel in a closed tab is already gone). `onRemoved`
 * carries only the tab id, so it needs no `tabs` permission.
 */
export async function onBackupTabClosed(tabId: number): Promise<void> {
  if ((await readBackupTabId()) === tabId) {
    await clearBackupTabId();
    await clearLifecycle();
  }
  if ((await readBackupLock())?.tab_id === tabId) await releaseBackupLock(tabId);
  if ((await readSettingsLock())?.tab_id === tabId) await releaseSettingsLock(tabId);
}

// ── Listeners ─────────────────────────────────────────────────────────────────

chrome.action.onClicked.addListener(() => {
  void openOrFocusBackupPage();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void onBackupTabClosed(tabId);
});

chrome.runtime.onMessage.addListener((msg: unknown) => {
  if (typeof msg !== 'object' || msg === null || !('type' in msg)) return;
  const { type } = msg as { type: string };
  if (type === 'start_oauth') void startOAuthFlow(CLIENT_ID);
  if (type === 'open_backup_page') void openOrFocusBackupPage();
  if (type === 'trigger_if_due') void triggerIfDue();
  if (type === 'raise_backup_tab') void raiseBackupTab();
  if (type === 'close_backup_tab') void closeBackupTab();
  if (type === 'mark_tab_adopted') void markTabAdopted();
  if (type === 'publish_detected') void publishDetected();
  if (type === 'claim_backup_tab') {
    const { tab_id } = msg as { tab_id?: number };
    if (typeof tab_id === 'number') void claimBackupTab(tab_id);
  }
});
