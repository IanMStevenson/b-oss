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
