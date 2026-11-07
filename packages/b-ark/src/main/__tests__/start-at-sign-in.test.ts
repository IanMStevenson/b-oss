// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { StartupTaskState } from '@b-oss/b-ark-ui-electron';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  createLoginItemStartAtSignIn,
  createStartAtSignInService,
  createStoreStartAtSignIn,
  loadStartupAddon,
  mapMacLoginItemStatus,
  mapStartupTaskStateName,
  selectStartAtSignIn,
  startedByStartupTask,
  STARTUP_TASK_ID,
  type LoginItemDeps,
  type StartAtSignIn,
  type StartupTaskAddon,
} from '../start-at-sign-in-pure.js';

/** Fake add-on that behaves like the native one: enable only from Disabled, disable only from Enabled. */
function fakeAddon(initial: string) {
  let state = initial;
  const addon: StartupTaskAddon = {
    getState: vi.fn(() => Promise.resolve(state)),
    enable: vi.fn(() => Promise.resolve((state = state === 'Disabled' ? 'Enabled' : state))),
    disable: vi.fn(() => Promise.resolve((state = state === 'Enabled' ? 'Disabled' : state))),
  };
  return addon;
}

const openExternal = vi.fn(() => Promise.resolve());

describe('mapStartupTaskStateName', () => {
  it.each([
    ['Enabled', 'on'],
    ['EnabledByPolicy', 'on'],
    ['Disabled', 'off'],
    ['DisabledByUser', 'needs-user-action'],
    ['DisabledByPolicy', 'blocked-by-policy'],
    ['Whatever', 'unknown'],
    ['', 'unknown'],
  ])('%j -> %s', (name, expected) => {
    expect(mapStartupTaskStateName(name)).toBe(expected);
  });
});

describe('mapMacLoginItemStatus', () => {
  it.each([
    ['enabled', true, 'on'],
    ['requires-approval', false, 'needs-user-action'],
    ['not-registered', false, 'off'],
    ['not-found', false, 'unknown'],
    [undefined, true, 'on'],
    [undefined, false, 'off'],
  ] as const)('%s / openAtLogin=%s -> %s', (status, open, expected) => {
    expect(mapMacLoginItemStatus(status, open)).toBe(expected);
  });
});

describe('login-item implementation', () => {
  function make(over: Partial<LoginItemDeps> = {}, initial = false) {
    let open = initial;
    const set = vi.fn((v: boolean) => void (open = v));
    const impl = createLoginItemStartAtSignIn({
      platform: 'win32',
      isPackaged: true,
      api: { get: () => ({ openAtLogin: open }), set },
      openExternal,
      ...over,
    });
    return { impl, set };
  }
  it('sets the flag and reads it back', async () => {
    const { impl, set } = make();
    expect(await impl.set(true)).toBe('on');
    expect(await impl.set(false)).toBe('off');
    expect(set).toHaveBeenNthCalledWith(1, true);
    expect(set).toHaveBeenNthCalledWith(2, false);
  });
  it('does not touch the login item in an unpackaged (dev) build', async () => {
    const { impl, set } = make({ isPackaged: false });
    await impl.set(true);
    expect(set).not.toHaveBeenCalled();
  });
  it('reports no state to the UI on the Windows installer and Linux', () => {
    expect(make().impl.settingsLocation).toBeNull();
    expect(make({ platform: 'linux' }).impl.settingsLocation).toBeNull();
  });
  it('on macOS maps the status and offers Login Items settings', async () => {
    const impl = createLoginItemStartAtSignIn({
      platform: 'darwin',
      isPackaged: true,
      api: { get: () => ({ openAtLogin: false, status: 'requires-approval' }), set: vi.fn() },
      openExternal,
    });
    expect(await impl.getState()).toBe('needs-user-action');
    expect(impl.settingsLocation?.path).toBe('System Settings → General → Login Items');
  });
  it('turns an Electron failure into unknown', async () => {
    const onError = vi.fn();
    const { impl } = make({
      api: {
        get: () => {
          throw new Error('boom');
        },
        set: vi.fn(),
      },
      onError,
    });
    expect(await impl.getState()).toBe('unknown');
    expect(onError).toHaveBeenCalled();
  });
});

describe('Store implementation', () => {
  const make = (addon: StartupTaskAddon | null, onError = vi.fn()) =>
    createStoreStartAtSignIn({ getAddon: () => addon, openExternal, onError });

  it('enables a disabled task, using the manifest task id', async () => {
    const a = fakeAddon('Disabled');
    expect(await make(a).set(true)).toBe('on');
    expect(a.enable).toHaveBeenCalledWith(STARTUP_TASK_ID);
  });
  it('disables an enabled task', async () => {
    const a = fakeAddon('Enabled');
    expect(await make(a).set(false)).toBe('off');
    expect(a.disable).toHaveBeenCalledWith(STARTUP_TASK_ID);
  });
  it('makes one add-on call per set and reports blocked states unchanged', async () => {
    for (const [name, neutral] of [
      ['DisabledByUser', 'needs-user-action'],
      ['DisabledByPolicy', 'blocked-by-policy'],
    ] as const) {
      const a = fakeAddon(name);
      expect(await make(a).set(true)).toBe(neutral);
      expect(a.getState).not.toHaveBeenCalled();
      expect(a.enable).toHaveBeenCalledOnce();
    }
  });
  it('a missing add-on is unknown, never a throw', async () => {
    const impl = make(null);
    expect(await impl.getState()).toBe('unknown');
    expect(await impl.set(true)).toBe('unknown');
  });
  it('an add-on call that rejects is unknown and reported', async () => {
    const onError = vi.fn();
    const a: StartupTaskAddon = {
      getState: () => Promise.reject(new Error('no package identity')),
      enable: () => Promise.reject(new Error('no package identity')),
      disable: () => Promise.reject(new Error('no package identity')),
    };
    const impl = make(a, onError);
    expect(await impl.getState()).toBe('unknown');
    expect(await impl.set(false)).toBe('unknown');
    expect(onError).toHaveBeenCalledTimes(2);
  });
  it('loads the add-on lazily and only once', async () => {
    const getAddon = vi.fn(() => fakeAddon('Enabled'));
    const impl = createStoreStartAtSignIn({ getAddon, openExternal });
    expect(getAddon).not.toHaveBeenCalled();
    await impl.getState();
    await impl.set(true);
    expect(getAddon).toHaveBeenCalledOnce();
  });
  it('opens Windows Startup settings', async () => {
    const impl = make(null);
    await impl.settingsLocation?.open();
    expect(openExternal).toHaveBeenCalledWith('ms-settings:startupapps');
    expect(impl.settingsLocation?.path).toBe('Windows Settings → Apps → Startup');
  });
});

describe('loadStartupAddon', () => {
  it('returns a well-formed module', () => {
    const a = fakeAddon('Enabled');
    expect(loadStartupAddon(() => a)).toBe(a);
  });
  it('a failing load is non-fatal: null, reported', () => {
    const onError = vi.fn();
    const result = loadStartupAddon(() => {
      throw new Error("Cannot find module 'win-startup.node'");
    }, onError);
    expect(result).toBeNull();
    expect(onError).toHaveBeenCalledOnce();
  });
  it('a module of the wrong shape is null', () => {
    expect(loadStartupAddon(() => ({ getState: 1 }))).toBeNull();
    expect(loadStartupAddon(() => null)).toBeNull();
  });
});

describe('selectStartAtSignIn', () => {
  const login = {
    platform: 'win32',
    isPackaged: true,
    api: { get: () => ({ openAtLogin: false }), set: vi.fn() },
    openExternal,
  } satisfies LoginItemDeps;
  const getAddon = vi.fn(() => fakeAddon('Enabled'));
  it('picks the Store implementation only for a Store build, without loading the add-on', () => {
    const store = selectStartAtSignIn({
      windowsStore: true,
      login,
      store: { getAddon, openExternal },
    });
    expect(store.idleWhenNotWanted).toBe(true);
    expect(getAddon).not.toHaveBeenCalled();
    const normal = selectStartAtSignIn({
      windowsStore: false,
      login,
      store: { getAddon, openExternal },
    });
    expect(normal.idleWhenNotWanted).toBe(false);
  });
});

describe('createStartAtSignInService', () => {
  function fake(state: 'on' | 'off' | 'needs-user-action', over: Partial<StartAtSignIn> = {}) {
    let s: StartupTaskState = state;
    const impl: StartAtSignIn = {
      getState: vi.fn(() => Promise.resolve(s)),
      set: vi.fn((w: boolean) => Promise.resolve<StartupTaskState>((s = w ? 'on' : 'off'))),
      settingsLocation: { path: 'P', openLabel: 'L', open: vi.fn(() => Promise.resolve()) },
      idleWhenNotWanted: true,
      ...over,
    };
    return impl;
  }
  const clock = () => {
    let t = 0;
    return { now: () => t, advance: (ms: number) => void (t += ms) };
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('Scheduled off at launch in a Store-style build: nothing is called, not even by the banner', async () => {
    const impl = fake('off');
    const svc = createStartAtSignInService(impl);
    svc.reconcileOnLaunch(false);
    expect(await svc.getInfo(false)).toBeNull();
    expect(impl.set).not.toHaveBeenCalled();
    expect(impl.getState).not.toHaveBeenCalled();
  });
  it('Scheduled on at launch reconciles once, and that answer feeds the banner (no second read)', async () => {
    const impl = fake('off');
    const svc = createStartAtSignInService(impl);
    svc.reconcileOnLaunch(true);
    expect(await svc.getInfo(true)).toEqual({
      state: 'on',
      settings: { path: 'P', openLabel: 'L' },
    });
    expect(impl.set).toHaveBeenCalledWith(true);
    expect(impl.getState).not.toHaveBeenCalled();
  });
  it('a login-item style build reconciles at launch even with Scheduled off', async () => {
    const impl = fake('on', { idleWhenNotWanted: false });
    createStartAtSignInService(impl).reconcileOnLaunch(false);
    await tick();
    expect(impl.set).toHaveBeenCalledWith(false);
  });
  it('shares an in-flight read and keeps a short cache, then re-reads', async () => {
    const impl = fake('on');
    const c = clock();
    const svc = createStartAtSignInService(impl, { now: c.now, cacheMs: 5000 });
    await Promise.all([svc.getInfo(true), svc.getInfo(true), svc.getInfo(true)]);
    expect(impl.getState).toHaveBeenCalledOnce();
    c.advance(4000);
    await svc.getInfo(true);
    expect(impl.getState).toHaveBeenCalledOnce();
    c.advance(2000);
    await svc.getInfo(true);
    expect(impl.getState).toHaveBeenCalledTimes(2);
  });
  it('turning Scheduled off applies it, and the banner stays silent', async () => {
    const impl = fake('on');
    const svc = createStartAtSignInService(impl);
    await svc.apply(false);
    expect(impl.set).toHaveBeenCalledWith(false);
    expect(await svc.getInfo(false)).toBeNull();
  });
  it('enable() asks once and returns the new state; the cache reflects it', async () => {
    const impl = fake('off');
    const svc = createStartAtSignInService(impl);
    expect((await svc.enable())?.state).toBe('on');
    expect((await svc.getInfo(true))?.state).toBe('on');
    expect(impl.getState).not.toHaveBeenCalled();
  });
  it('a blocked state is passed through for the banner', async () => {
    const impl = fake('needs-user-action', {
      set: vi.fn(() => Promise.resolve('needs-user-action' as const)),
    });
    expect((await createStartAtSignInService(impl).enable())?.state).toBe('needs-user-action');
  });
  it('reports nothing when the platform has no settings location', async () => {
    const impl = fake('on', { settingsLocation: null });
    const svc = createStartAtSignInService(impl);
    expect(await svc.getInfo(true)).toBeNull();
    expect(await svc.enable()).toBeNull();
    expect(impl.getState).not.toHaveBeenCalled();
  });
  it('a missing add-on end to end gives unknown (the banner), not a crash', async () => {
    const store = createStoreStartAtSignIn({
      getAddon: () =>
        loadStartupAddon(() => {
          throw new Error('no such file');
        }),
      openExternal,
    });
    const svc = createStartAtSignInService(store);
    svc.reconcileOnLaunch(true);
    expect((await svc.getInfo(true))?.state).toBe('unknown');
  });
  it('opens the settings page through the platform', async () => {
    const impl = fake('on');
    await createStartAtSignInService(impl).openSettings();
    expect(impl.settingsLocation?.open).toHaveBeenCalledOnce();
  });
});

describe('packaging config', () => {
  const config = JSON.parse(
    readFileSync(new URL('../../../electron-builder.store.json', import.meta.url), 'utf8'),
  ) as { extraResources: unknown[]; appx: unknown };
  const base = JSON.parse(
    readFileSync(new URL('../../../electron-builder.json', import.meta.url), 'utf8'),
  ) as { files: string[]; asarUnpack?: string[] };
  it('copies the add-on beside the app in the Store config only', () => {
    expect(JSON.stringify(config.extraResources)).toContain('b-win-startup/dist/win-startup.node');
    expect(JSON.stringify(base)).not.toContain('win-startup');
  });
  it('the manifest task id matches the add-on call', () => {
    const xml = readFileSync(
      new URL('../../../msix/startup-task-extension.xml', import.meta.url),
      'utf8',
    );
    expect(xml).toContain(`TaskId="${STARTUP_TASK_ID}"`);
  });
});

describe('startedByStartupTask', () => {
  const withKind = (kind: () => Promise<string>) => ({ ...fakeAddon('Enabled'), launchKind: kind });
  it('is true only for a StartupTask activation', async () => {
    expect(await startedByStartupTask(withKind(() => Promise.resolve('StartupTask')))).toBe(true);
    expect(await startedByStartupTask(withKind(() => Promise.resolve('Launch')))).toBe(false);
    expect(await startedByStartupTask(withKind(() => Promise.resolve('Unknown')))).toBe(false);
  });
  it('is false with no add-on or an add-on without launchKind', async () => {
    expect(await startedByStartupTask(null)).toBe(false);
    expect(await startedByStartupTask(fakeAddon('Enabled'))).toBe(false);
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
