// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { StartupTaskState } from '@b-oss/b-ark-ui-electron';
import {
  buildInvokeInPackageScript,
  buildStartupTaskScript,
  createStartupTaskController,
  packageFamilyNameFromExePath,
  parseStartupTaskOutput,
  STARTUP_TASK_APP_ID,
  STARTUP_TASK_ID,
  type StartupTaskDriver,
} from '../startup-task-pure.js';

function fakeDriver(initial: StartupTaskState, afterEnable: StartupTaskState = 'enabled') {
  let state = initial;
  const driver: StartupTaskDriver = {
    read: vi.fn(() => Promise.resolve(state)),
    requestEnable: vi.fn(() => Promise.resolve((state = afterEnable))),
    disable: vi.fn(() => Promise.resolve((state = 'disabled' as StartupTaskState))),
  };
  return driver;
}

describe('parseStartupTaskOutput', () => {
  it.each([
    ['STATE=Enabled\r\n', 'enabled'],
    ['STATE=EnabledByPolicy', 'enabled-by-policy'],
    ['STATE=Disabled', 'disabled'],
    ['noise\nSTATE=DisabledByUser\n', 'disabled-by-user'],
    ['STATE=DisabledByPolicy', 'disabled-by-policy'],
    ['STATE=Whatever', 'unknown'],
    ['', 'unknown'],
  ])('%j -> %s', (out, expected) => {
    expect(parseStartupTaskOutput(out)).toBe(expected);
  });
});

describe('buildStartupTaskScript', () => {
  it('targets the manifest task id and prints the state', () => {
    const s = buildStartupTaskScript('read');
    expect(s).toContain(`GetAsync('${STARTUP_TASK_ID}')`);
    expect(s).toContain("'STATE=' + $task.State");
    expect(s).not.toContain('RequestEnableAsync');
  });
  it('only requests enable from plain Disabled, and disable calls Disable()', () => {
    expect(buildStartupTaskScript('enable')).toContain("-eq 'Disabled'");
    expect(buildStartupTaskScript('disable')).toContain('$task.Disable()');
  });
});

describe('createStartupTaskController', () => {
  it('enables a disabled task when wanted', async () => {
    const d = fakeDriver('disabled');
    expect(await createStartupTaskController(d).set(true)).toEqual({ state: 'enabled' });
    expect(d.requestEnable).toHaveBeenCalledOnce();
  });
  it('reports a task that stays disabled after the request', async () => {
    const d = fakeDriver('disabled', 'disabled');
    expect(await createStartupTaskController(d).set(true)).toEqual({ state: 'disabled' });
  });
  it('never tries to change a user- or policy-blocked task', async () => {
    for (const s of ['disabled-by-user', 'disabled-by-policy'] as const) {
      const d = fakeDriver(s);
      expect(await createStartupTaskController(d).set(true)).toEqual({ state: s });
      expect(await createStartupTaskController(d).set(false)).toEqual({ state: s });
      expect(d.requestEnable).not.toHaveBeenCalled();
      expect(d.disable).not.toHaveBeenCalled();
    }
  });
  it('disables an enabled task when not wanted, leaves an enabled one when wanted', async () => {
    const d = fakeDriver('enabled');
    const c = createStartupTaskController(d);
    await c.set(true);
    expect(d.disable).not.toHaveBeenCalled();
    expect(await c.set(false)).toEqual({ state: 'disabled' });
  });
  it('turns a driver failure into unknown and reports it', async () => {
    const onError = vi.fn();
    const d: StartupTaskDriver = {
      read: () => Promise.reject(new Error('no package identity')),
      requestEnable: () => Promise.resolve('enabled'),
      disable: () => Promise.resolve('disabled'),
    };
    const c = createStartupTaskController(d, onError);
    expect(await c.get()).toEqual({ state: 'unknown' });
    expect(await c.set(true)).toEqual({ state: 'unknown' });
    expect(onError).toHaveBeenCalled();
  });
});

describe('packageFamilyNameFromExePath', () => {
  it.each([
    [
      'C:\\Program Files\\WindowsApps\\ImsTest.b-ark_1.0.7.0_x64__bgf47mq2ba09r\\app\\b-ark.exe',
      'ImsTest.b-ark_bgf47mq2ba09r',
    ],
    [
      'D:\\WindowsApps\\IanStevenson.b-ark_1.0.7.0_x64__abc123def\\app\\b-ark.exe',
      'IanStevenson.b-ark_abc123def',
    ],
  ])('%s -> %s', (path, expected) => {
    expect(packageFamilyNameFromExePath(path)).toBe(expected);
  });
  it('is null outside a WindowsApps package', () => {
    expect(
      packageFamilyNameFromExePath('C:\\Users\\x\\AppData\\Local\\Programs\\b-ark\\b-ark.exe'),
    ).toBeNull();
    expect(
      packageFamilyNameFromExePath('C:\\Program Files\\WindowsApps\\odd\\b-ark.exe'),
    ).toBeNull();
  });
});

describe('in-package script', () => {
  it('writes the result or the error to the given file instead of stdout', () => {
    const s = buildStartupTaskScript('read', STARTUP_TASK_ID, "C:\\Users\\Public\\it's.txt");
    expect(s).toContain("Set-Content -LiteralPath 'C:\\Users\\Public\\it''s.txt' -Value $result");
    expect(s).toContain("'ERROR=' + $_.Exception.Message");
    expect(s).not.toContain('Write-Output');
  });
  it('is launched with Invoke-CommandInDesktopPackage for the right package and app', () => {
    const s = buildInvokeInPackageScript('IanStevenson.b-ark_abc123', 'bark', 'QUJD');
    expect(s).toContain("-PackageFamilyName 'IanStevenson.b-ark_abc123' -AppId 'bark'");
    expect(s).toContain('-EncodedCommand QUJD');
  });
  it('uses the application id the Store build declares', () => {
    const config = JSON.parse(
      readFileSync(new URL('../../../electron-builder.store.json', import.meta.url), 'utf8'),
    ) as { appx: { applicationId: string } };
    expect(STARTUP_TASK_APP_ID).toBe(config.appx.applicationId);
  });
});
