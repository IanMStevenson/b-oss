// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { startOAuthFlow } from './oauth.js';

const CLIENT_ID = import.meta.env.VITE_CHROME_CLIENT_ID ?? '';
const BACKUP_PAGE = 'src/backup-page.html';
const LIFECYCLE_KEY = 'backup_lifecycle';
const PUBLISH_PENDING_KEY = 'publish_pending';

// ── Inline types (mirrors b-ark-ui-chrome to avoid a cross-package dep) ──────

type RagState = 'green' | 'amber' | 'red';

interface ChromeStatus {
  last_backup_at: string | null;
  rag_state: RagState;
}

interface ChromeSettings {
  period: 'daily' | 'weekly';
}

interface BackupLifecycle {
  tab_id: number;
  launched_by: 'visit-trigger' | 'user';
  started_at: string;
  user_adopted: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isPeriodDue(lastBackupAt: string | null, period: 'daily' | 'weekly'): boolean {
  if (!lastBackupAt) return true;
  const ms = period === 'daily' ? 86_400_000 : 7 * 86_400_000;
  return Date.now() - new Date(lastBackupAt).getTime() >= ms;
}

function getBackupPageUrl(): string {
  return chrome.runtime.getURL(BACKUP_PAGE);
}

/** Return the tab_id from backup_lifecycle if that tab still exists. */
async function getLiveLifecycleTabId(): Promise<number | null> {
  const r = await chrome.storage.local.get(LIFECYCLE_KEY);
  const lifecycle = r[LIFECYCLE_KEY] as BackupLifecycle | undefined;
  if (!lifecycle) return null;
  try {
    await chrome.tabs.get(lifecycle.tab_id);
    return lifecycle.tab_id;
  } catch {
    // Tab is gone — clean up stale lifecycle
    await chrome.storage.local.remove(LIFECYCLE_KEY);
    return null;
  }
}

// ── Tab management ────────────────────────────────────────────────────────────

async function openOrFocusBackupPage(): Promise<void> {
  const url = getBackupPageUrl();
  const tabs = await chrome.tabs.query({ url });
  if (tabs.length > 0 && tabs[0]?.id !== undefined) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    if (tabs[0].windowId !== undefined) {
      await chrome.windows.update(tabs[0].windowId, { focused: true });
    }
  } else {
    await chrome.tabs.create({ url, active: true });
  }
}

/** Open the backup page as an unfocused background tab (singleton). */
async function launchBackupTabSilent(): Promise<void> {
  const url = getBackupPageUrl();
  const tab = await chrome.tabs.create({ url, active: false });
  if (!tab.id) return;
  const lifecycle: BackupLifecycle = {
    tab_id: tab.id,
    launched_by: 'visit-trigger',
    started_at: new Date().toISOString(),
    user_adopted: false,
  };
  await chrome.storage.local.set({ [LIFECYCLE_KEY]: lifecycle });
}

// ── Visit-trigger logic ───────────────────────────────────────────────────────

/**
 * Called by the chip content script on every Blipfoto page visit.
 * Decides whether to auto-launch the backup page as a silent background tab.
 */
async function triggerIfDue(): Promise<void> {
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

  // Backup already running (amber + progress) — do nothing
  if (rag === 'amber' && progress != null) return;

  // Singleton check — backup tab already open
  const existingTabId = await getLiveLifecycleTabId();
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

  if (isPeriodDue(status.last_backup_at ?? null, period)) {
    await launchBackupTabSilent();
  }
}

// ── Publish-trigger logic ─────────────────────────────────────────────────────

/**
 * Called when the user clicks Publish or Save changes on a Blipfoto entry page.
 * If a backup is already running (or a tab is already open), sets a pending flag
 * so that another pass starts as soon as the current one finishes.
 */
async function publishDetected(): Promise<void> {
  const r = await chrome.storage.local.get([
    'tokenCiphertext',
    'folder_ready',
    'chip_rag',
    'chip_progress',
  ]);

  if (!r['tokenCiphertext'] || !r['folder_ready']) return;

  const rag = (r['chip_rag'] as RagState | undefined) ?? 'green';
  const progress = r['chip_progress'] as { done: number; total: number } | null | undefined;
  const backupRunning = rag === 'amber' && progress != null;

  if (backupRunning) {
    await chrome.storage.local.set({ [PUBLISH_PENDING_KEY]: true });
    return;
  }

  const existingTabId = await getLiveLifecycleTabId();
  if (existingTabId !== null) {
    await chrome.storage.local.set({ [PUBLISH_PENDING_KEY]: true });
    return;
  }

  await launchBackupTabSilent();
}

// ── Lifecycle handlers (called by the backup page) ────────────────────────────

/**
 * Raise the backup tab + focus its window so the user sees the error.
 * Called by the backup page whenever a backup fails (never silent on error).
 */
async function raiseBackupTab(): Promise<void> {
  const r = await chrome.storage.local.get(LIFECYCLE_KEY);
  const lifecycle = r[LIFECYCLE_KEY] as BackupLifecycle | undefined;

  if (lifecycle?.tab_id) {
    try {
      const tab = await chrome.tabs.get(lifecycle.tab_id);
      await chrome.tabs.update(lifecycle.tab_id, { active: true });
      if (tab.windowId !== undefined) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      // Raising counts as adoption — user is now looking at it
      const updated: BackupLifecycle = { ...lifecycle, user_adopted: true };
      await chrome.storage.local.set({ [LIFECYCLE_KEY]: updated });
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
async function closeBackupTab(): Promise<void> {
  const r = await chrome.storage.local.get(LIFECYCLE_KEY);
  const lifecycle = r[LIFECYCLE_KEY] as BackupLifecycle | undefined;

  if (lifecycle?.launched_by === 'visit-trigger' && !lifecycle.user_adopted) {
    try {
      await chrome.tabs.remove(lifecycle.tab_id);
    } catch {
      // Already closed
    }
  }
  await chrome.storage.local.remove(LIFECYCLE_KEY);

  // If a publish was detected while the backup was running, start another pass.
  const pending = await chrome.storage.local.get(PUBLISH_PENDING_KEY);
  if (pending[PUBLISH_PENDING_KEY]) {
    await chrome.storage.local.remove(PUBLISH_PENDING_KEY);
    await launchBackupTabSilent();
  }
}

/**
 * Mark the lifecycle's tab as adopted (user focused it).
 * Called by BrowserBackend when window focus fires inside the backup page.
 */
async function markTabAdopted(): Promise<void> {
  const r = await chrome.storage.local.get(LIFECYCLE_KEY);
  const lifecycle = r[LIFECYCLE_KEY] as BackupLifecycle | undefined;
  if (!lifecycle) return;
  const updated: BackupLifecycle = { ...lifecycle, user_adopted: true };
  await chrome.storage.local.set({ [LIFECYCLE_KEY]: updated });
}

// ── Listeners ─────────────────────────────────────────────────────────────────

chrome.action.onClicked.addListener(() => {
  void openOrFocusBackupPage();
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
});

export {};
