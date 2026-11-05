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
  it('runs the in-package PowerShell hidden', () => {
    expect(buildInvokeInPackageScript('A_b', 'bark', 'QQ==')).toContain('-WindowStyle Hidden');
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
  it('makes one Windows call per set, and reports what Windows says', async () => {
    for (const s of ['disabled-by-user', 'disabled-by-policy'] as const) {
      const d = fakeDriver(s, s);
      expect(await createStartupTaskController(d).set(true)).toEqual({ state: s });
      expect(d.read).not.toHaveBeenCalled();
      expect(d.requestEnable).toHaveBeenCalledOnce();
    }
    const d = fakeDriver('enabled');
    expect(await createStartupTaskController(d).set(false)).toEqual({ state: 'disabled' });
    expect(d.read).not.toHaveBeenCalled();
    expect(d.disable).toHaveBeenCalledOnce();
  });
  it('leaves blocked states alone inside the script itself', () => {
    expect(buildStartupTaskScript('enable')).toContain("-eq 'Disabled'");
    expect(buildStartupTaskScript('disable')).toContain("$task.State -eq 'Enabled'");
  });
  it('turns a driver failure into unknown and reports it', async () => {
    const onError = vi.fn();
    const d: StartupTaskDriver = {
      read: () => Promise.reject(new Error('no package identity')),
      requestEnable: () => Promise.reject(new Error('no package identity')),
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
