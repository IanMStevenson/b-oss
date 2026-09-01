// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { installChromeFake, type FakeChrome } from './chrome-fake.js';

// sw.ts registers its chrome.* listeners once, at import time — so the fake must be
// installed before the (single, dynamic) import, and every test after that reuses the same
// fake instance via `.reset()` rather than reinstalling a fresh one. See chrome-fake.ts.
let fake: FakeChrome;
let sw: typeof import('../sw.js');

beforeAll(async () => {
  fake = installChromeFake();
  sw = await import('../sw.js');
});

/** The fake always assigns an id, unlike real chrome.tabs.Tab where it's optional. */
function requireId(tab: chrome.tabs.Tab): number {
  if (tab.id === undefined) throw new Error('fake tab has no id');
  return tab.id;
}

beforeEach(() => {
  fake.reset();
});

afterAll(() => {
  fake.uninstall();
});

describe('isPeriodDue', () => {
  it('is due when there is no prior backup', () => {
    expect(sw.isPeriodDue(null, 'daily')).toBe(true);
  });

  it('is not due within the daily window', () => {
    expect(sw.isPeriodDue(new Date().toISOString(), 'daily')).toBe(false);
  });

  it('is due once the weekly window has elapsed', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();
    expect(sw.isPeriodDue(eightDaysAgo, 'weekly')).toBe(true);
  });
});

describe('isBackupStillRunning', () => {
  it('is true for amber + a progress cursor + a live tab', () => {
    expect(sw.isBackupStillRunning('amber', { done: 0, total: 1 }, 7)).toBe(true);
  });

  it('is false for amber + progress but no live tab (crashed/stuck run — self-heals)', () => {
    expect(sw.isBackupStillRunning('amber', { done: 0, total: 1 }, null)).toBe(false);
  });

  it('is false when there is no progress cursor, even with a live tab', () => {
    expect(sw.isBackupStillRunning('amber', null, 7)).toBe(false);
  });

  it('is false for green/red regardless of progress or tab', () => {
    expect(sw.isBackupStillRunning('green', { done: 0, total: 1 }, 7)).toBe(false);
    expect(sw.isBackupStillRunning('red', { done: 0, total: 1 }, 7)).toBe(false);
  });
});

describe('getLiveBackupTabId', () => {
  it('returns null when no backup_tab_id is stored', async () => {
    expect(await sw.getLiveBackupTabId()).toBeNull();
  });

  it('returns the id when the tracked tab still exists', async () => {
    const tab = await chrome.tabs.create({ url: 'x', active: false });
    fake.storage.set('backup_tab_id', tab.id);
    expect(await sw.getLiveBackupTabId()).toBe(tab.id);
  });

  it('self-heals: clears backup_tab_id + lifecycle when the tracked tab is gone', async () => {
    fake.storage.set('backup_tab_id', 999);
    fake.storage.set('backup_lifecycle', {
      tab_id: 999,
      launched_by: 'user',
      started_at: 'x',
      user_adopted: false,
    });

    expect(await sw.getLiveBackupTabId()).toBeNull();
    expect(fake.storage.has('backup_tab_id')).toBe(false);
    expect(fake.storage.has('backup_lifecycle')).toBe(false);
  });
});

describe('triggerIfDue', () => {
  function markSetUp(): void {
    fake.storage.set('tokenCiphertext', 'ciphertext');
    fake.storage.set('folder_ready', true);
  }

  it('does nothing when not set up', async () => {
    await sw.triggerIfDue();
    expect(fake.tabs.size).toBe(0);
  });

  it('does nothing when a live backup tab is already open', async () => {
    markSetUp();
    await chrome.tabs.create({ url: 'x' });
    const tab = [...fake.tabs.values()][0];
    fake.storage.set('backup_tab_id', tab.id);

    await sw.triggerIfDue();
    expect(fake.tabs.size).toBe(1);
  });

  it('regression: self-heals a stuck amber+progress state with no live tab, instead of wedging forever', async () => {
    markSetUp();
    fake.storage.set('chip_rag', 'amber');
    fake.storage.set('chip_progress', { done: 0, total: 1 });
    // No backup_tab_id at all — the run that set this state crashed without a tab to finish it.

    await sw.triggerIfDue();
    expect(fake.tabs.size).toBe(1);
  });

  it('does nothing when amber+progress is backed by a genuinely live tab', async () => {
    markSetUp();
    const tab = await chrome.tabs.create({ url: 'x' });
    fake.storage.set('backup_tab_id', tab.id);
    fake.storage.set('chip_rag', 'amber');
    fake.storage.set('chip_progress', { done: 0, total: 1 });

    await sw.triggerIfDue();
    expect(fake.tabs.size).toBe(1); // no second tab launched
  });

  it('opens a focused tab when rag is red', async () => {
    markSetUp();
    fake.storage.set('chip_rag', 'red');

    await sw.triggerIfDue();
    expect(fake.tabs.size).toBe(1);
    expect([...fake.tabs.values()][0].active).toBe(true);
  });

  it('launches a silent tab when the schedule period has elapsed', async () => {
    markSetUp();
    fake.storage.set('chip_rag', 'green');
    fake.storage.set('b_ark_status', { last_backup_at: null, rag_state: 'green' });
    fake.storage.set('b_ark_settings', { period: 'daily', schedule_enabled: true });

    await sw.triggerIfDue();
    expect(fake.tabs.size).toBe(1);
    expect([...fake.tabs.values()][0].active).toBe(false);
  });

  it('does nothing when green and the schedule period has not elapsed', async () => {
    markSetUp();
    fake.storage.set('chip_rag', 'green');
    fake.storage.set('b_ark_status', {
      last_backup_at: new Date().toISOString(),
      rag_state: 'green',
    });
    fake.storage.set('b_ark_settings', { period: 'daily', schedule_enabled: true });

    await sw.triggerIfDue();
    expect(fake.tabs.size).toBe(0);
  });
});

describe('publishDetected', () => {
  function markSetUp(): void {
    fake.storage.set('tokenCiphertext', 'ciphertext');
    fake.storage.set('folder_ready', true);
  }

  it('defers via publish_pending when a backup is genuinely running on a live tab', async () => {
    markSetUp();
    const tab = await chrome.tabs.create({ url: 'x' });
    fake.storage.set('backup_tab_id', requireId(tab));
    fake.storage.set('chip_rag', 'amber');
    fake.storage.set('chip_progress', { done: 0, total: 1 });

    await sw.publishDetected();
    expect(fake.storage.get('publish_pending')).toBe(true);
    expect(fake.tabs.size).toBe(1); // no second tab
    expect(fake.sentTabMessages).toHaveLength(0);
  });

  it('regression: self-heals a stuck amber+progress state with no live tab, launching fresh instead of deferring forever', async () => {
    markSetUp();
    fake.storage.set('chip_rag', 'amber');
    fake.storage.set('chip_progress', { done: 0, total: 1 });

    await sw.publishDetected();
    expect(fake.tabs.size).toBe(1);
    expect(fake.storage.has('publish_pending')).toBe(false);
  });

  it('launches a fresh silent tab when idle (green, no live tab)', async () => {
    markSetUp();
    fake.storage.set('chip_rag', 'green');

    await sw.publishDetected();
    expect(fake.tabs.size).toBe(1);
  });

  it('regression: messages an open-but-idle tab to start a backup, instead of deferring into a flag nothing will ever consume', async () => {
    markSetUp();
    const tab = await chrome.tabs.create({ url: 'x' });
    const tabId = requireId(tab);
    fake.storage.set('backup_tab_id', tabId);
    fake.storage.set('chip_rag', 'green'); // open, but not actively backing up

    await sw.publishDetected();

    expect(fake.sentTabMessages).toEqual([{ tabId, message: { type: 'start_backup_now' } }]);
    expect(fake.tabs.size).toBe(1); // no second tab opened
    expect(fake.storage.has('publish_pending')).toBe(false);
  });

  it('falls back to publish_pending when the idle tab cannot be reached', async () => {
    markSetUp();
    const tab = await chrome.tabs.create({ url: 'x' });
    const tabId = requireId(tab);
    fake.storage.set('backup_tab_id', tabId);
    fake.storage.set('chip_rag', 'green');
    fake.failSendMessageTo.add(tabId);

    await sw.publishDetected();

    expect(fake.storage.get('publish_pending')).toBe(true);
    expect(fake.tabs.size).toBe(1);
  });
});

describe('claimBackupTab', () => {
  it('claims the singleton when no live tab is tracked', async () => {
    await sw.claimBackupTab(42);
    expect(fake.storage.get('backup_tab_id')).toBe(42);
  });

  it('focuses the existing canonical tab and closes the duplicate', async () => {
    const canonical = await chrome.tabs.create({ url: 'x' });
    fake.storage.set('backup_tab_id', requireId(canonical));
    const duplicate = await chrome.tabs.create({ url: 'x' });

    await sw.claimBackupTab(requireId(duplicate));

    expect(fake.storage.get('backup_tab_id')).toBe(canonical.id);
    expect(fake.tabs.has(requireId(duplicate))).toBe(false);
    expect(fake.windowUpdates.some((w) => w.windowId === canonical.windowId)).toBe(true);
  });
});

describe('closeBackupTab', () => {
  it('closes an un-adopted visit-triggered tab and clears the singleton', async () => {
    const tab = await chrome.tabs.create({ url: 'x' });
    const tabId = requireId(tab);
    fake.storage.set('backup_tab_id', tabId);
    fake.storage.set('backup_lifecycle', {
      tab_id: tabId,
      launched_by: 'visit-trigger',
      started_at: 'x',
      user_adopted: false,
    });

    await sw.closeBackupTab();

    expect(fake.tabs.has(tabId)).toBe(false);
    expect(fake.storage.has('backup_tab_id')).toBe(false);
    expect(fake.storage.has('backup_lifecycle')).toBe(false);
  });

  it('leaves an adopted tab open', async () => {
    const tab = await chrome.tabs.create({ url: 'x' });
    const tabId = requireId(tab);
    fake.storage.set('backup_tab_id', tabId);
    fake.storage.set('backup_lifecycle', {
      tab_id: tabId,
      launched_by: 'visit-trigger',
      started_at: 'x',
      user_adopted: true,
    });

    await sw.closeBackupTab();

    expect(fake.tabs.has(tabId)).toBe(true);
  });

  it('replays a pending publish by launching a fresh backup tab', async () => {
    fake.storage.set('publish_pending', true);

    await sw.closeBackupTab();

    expect(fake.tabs.size).toBe(1);
    expect(fake.storage.has('publish_pending')).toBe(false);
  });
});

describe('onBackupTabClosed', () => {
  it('clears the singleton tracking when the closed tab was canonical', async () => {
    fake.storage.set('backup_tab_id', 5);
    fake.storage.set('backup_lifecycle', {
      tab_id: 5,
      launched_by: 'user',
      started_at: 'x',
      user_adopted: false,
    });

    await sw.onBackupTabClosed(5);

    expect(fake.storage.has('backup_tab_id')).toBe(false);
    expect(fake.storage.has('backup_lifecycle')).toBe(false);
  });

  it('releases the backup lock when the closed tab held it', async () => {
    fake.storage.set('backup_lock', { tab_id: 9, started_at: 'x' });

    await sw.onBackupTabClosed(9);

    expect(fake.storage.has('backup_lock')).toBe(false);
  });

  it('is a no-op for a tab that held no tracked state', async () => {
    fake.storage.set('backup_tab_id', 5);

    await sw.onBackupTabClosed(1234);

    expect(fake.storage.get('backup_tab_id')).toBe(5);
  });
});
