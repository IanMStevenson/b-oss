// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  applyStartupTask,
  loadStartupAddon,
  readLaunchKind,
  startedByStartupTask,
  STARTUP_TASK_ID,
} from '../store-startup.js';

const addon = () => ({
  getState: vi.fn(() => Promise.resolve('Disabled')),
  enable: vi.fn(() => Promise.resolve('Enabled')),
  disable: vi.fn(() => Promise.resolve('Disabled')),
});

describe('store startup task', () => {
  it('uses the task id declared in the manifest extension', () => {
    const xml = readFileSync(
      resolve(__dirname, '../../../msix/startup-task-extension.xml'),
      'utf8',
    );
    expect(xml).toContain(`TaskId="${STARTUP_TASK_ID}"`);
  });

  it('enables when wanted and disables when not', async () => {
    const a = addon();
    expect(await applyStartupTask(a, true, vi.fn())).toBe('Enabled');
    expect(a.enable).toHaveBeenCalledWith(STARTUP_TASK_ID);
    expect(await applyStartupTask(a, false, vi.fn())).toBe('Disabled');
    expect(a.disable).toHaveBeenCalledWith(STARTUP_TASK_ID);
  });

  it('does nothing and does not throw without the add-on', async () => {
    expect(await applyStartupTask(null, true, vi.fn())).toBe('add-on unavailable');
  });

  it('reports a rejected call instead of throwing', async () => {
    const a = addon();
    a.enable.mockRejectedValue(new Error('boom'));
    const onError = vi.fn();
    expect(await applyStartupTask(a, true, onError)).toBe('error');
    expect(onError).toHaveBeenCalled();
  });

  it('loads a well-formed add-on and rejects a missing or malformed one', () => {
    const onError = vi.fn();
    expect(loadStartupAddon(() => addon(), onError)).not.toBeNull();
    expect(loadStartupAddon(() => ({ getState: 1 }), onError)).toBeNull();
    expect(
      loadStartupAddon(() => {
        throw new Error('no file');
      }, onError),
    ).toBeNull();
    expect(onError).toHaveBeenCalledTimes(2);
  });
});

describe('startedByStartupTask', () => {
  const withKind = (kind: () => Promise<string>) => ({ ...addon(), launchKind: kind });
  it('is true only for a StartupTask activation', async () => {
    expect(await startedByStartupTask(withKind(() => Promise.resolve('StartupTask')))).toBe(true);
    expect(await startedByStartupTask(withKind(() => Promise.resolve('Launch')))).toBe(false);
    expect(await startedByStartupTask(withKind(() => Promise.resolve('Unknown')))).toBe(false);
  });
  it('is false with no add-on or an add-on without launchKind', async () => {
    expect(await startedByStartupTask(null)).toBe(false);
    expect(await startedByStartupTask(addon())).toBe(false);
  });
  it('is false, and reported, when the call rejects', async () => {
    const onError = vi.fn();
    expect(
      await startedByStartupTask(
        withKind(() => Promise.reject(new Error('x'))),
        onError,
      ),
    ).toBe(false);
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe('readLaunchKind', () => {
  it('returns the raw kind, or null when unreadable', async () => {
    const a = { ...addon(), launchKind: () => Promise.resolve('Unknown') };
    expect(await readLaunchKind(a)).toBe('Unknown');
    expect(await readLaunchKind(null)).toBeNull();
    expect(await readLaunchKind(addon())).toBeNull();
    const onError = vi.fn();
    const bad = { ...addon(), launchKind: () => Promise.reject(new Error('x')) };
    expect(await readLaunchKind(bad, onError)).toBeNull();
    expect(onError).toHaveBeenCalled();
  });
});
