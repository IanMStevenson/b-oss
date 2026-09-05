// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { installChromeStorageLocal, type FakeChromeStorage } from './helpers.js';
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
  acquireBackupLock,
  releaseBackupLock,
  readSettingsLock,
  acquireSettingsLock,
  releaseSettingsLock,
} from '../lifecycle-storage.js';

let fake: FakeChromeStorage;
beforeEach(() => {
  fake = installChromeStorageLocal();
});
afterEach(() => {
  fake.uninstall();
});

const lifecycle: BackupLifecycle = {
  tab_id: 7,
  launched_by: 'visit-trigger',
  started_at: '2024-01-01T00:00:00Z',
  user_adopted: false,
};

describe('lifecycle-storage', () => {
  it('reads null when nothing is stored', async () => {
    expect(await readLifecycle()).toBeNull();
  });

  it('saves and reads back the lifecycle', async () => {
    await saveLifecycle(lifecycle);
    expect(await readLifecycle()).toEqual(lifecycle);
    expect(fake.store.get('backup_lifecycle')).toEqual(lifecycle);
  });

  it('updateLifecycle merges into the stored value', async () => {
    await saveLifecycle(lifecycle);
    const updated = await updateLifecycle({ user_adopted: true });
    expect(updated?.user_adopted).toBe(true);
    expect(updated?.tab_id).toBe(7);
    expect((await readLifecycle())?.user_adopted).toBe(true);
  });

  it('updateLifecycle is a no-op (null) when nothing is stored', async () => {
    expect(await updateLifecycle({ user_adopted: true })).toBeNull();
  });

  it('clearLifecycle removes it', async () => {
    await saveLifecycle(lifecycle);
    await clearLifecycle();
    expect(await readLifecycle()).toBeNull();
  });

  it('publish-pending is a one-shot flag', async () => {
    expect(await consumePublishPending()).toBe(false);
    await setPublishPending();
    expect(await consumePublishPending()).toBe(true);
    // consumed — second read is false
    expect(await consumePublishPending()).toBe(false);
    expect(fake.store.has('publish_pending')).toBe(false);
  });
});

describe('backup_tab_id', () => {
  it('reads null when nothing is stored', async () => {
    expect(await readBackupTabId()).toBeNull();
  });

  it('saves, reads back, and clears the tab id', async () => {
    await saveBackupTabId(42);
    expect(await readBackupTabId()).toBe(42);
    expect(fake.store.get('backup_tab_id')).toBe(42);
    await clearBackupTabId();
    expect(await readBackupTabId()).toBeNull();
  });
});

describe('backup_lock', () => {
  it('reads null when no lock is held', async () => {
    expect(await readBackupLock()).toBeNull();
  });

  it('acquires and reads back the owning tab + start time', async () => {
    await acquireBackupLock(7, '2024-01-01T00:00:00Z');
    expect(await readBackupLock()).toEqual({ tab_id: 7, started_at: '2024-01-01T00:00:00Z' });
  });

  it('release is a no-op when a different tab owns the lock', async () => {
    await acquireBackupLock(7, '2024-01-01T00:00:00Z');
    await releaseBackupLock(8); // not the owner
    expect((await readBackupLock())?.tab_id).toBe(7);
  });

  it('the owning tab can release the lock', async () => {
    await acquireBackupLock(7, '2024-01-01T00:00:00Z');
    await releaseBackupLock(7);
    expect(await readBackupLock()).toBeNull();
  });

  it('an unconditional release clears any lock', async () => {
    await acquireBackupLock(7, '2024-01-01T00:00:00Z');
    await releaseBackupLock();
    expect(await readBackupLock()).toBeNull();
  });
});

describe('settings_lock', () => {
  it('reads null when no lock is held', async () => {
    expect(await readSettingsLock()).toBeNull();
  });

  it('acquires, reads back, and the owner releases', async () => {
    await acquireSettingsLock(3);
    expect(await readSettingsLock()).toEqual({ tab_id: 3 });
    await releaseSettingsLock(3);
    expect(await readSettingsLock()).toBeNull();
  });

  it('release is a no-op when a different tab owns the lock', async () => {
    await acquireSettingsLock(3);
    await releaseSettingsLock(4); // not the owner
    expect((await readSettingsLock())?.tab_id).toBe(3);
  });

  it('self-heals a lock whose owning tab no longer exists', async () => {
    await acquireSettingsLock(3);
    fake.closeTab(3); // simulate the tab being closed without a clean unmount
    expect(await readSettingsLock()).toBeNull();
    // The stale entry should actually be cleared, not just reported as null.
    expect(fake.store.has('settings_lock')).toBe(false);
  });
});
