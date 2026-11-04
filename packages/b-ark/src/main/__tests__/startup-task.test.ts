// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it, vi } from 'vitest';
import type { StartupTaskState } from '@b-oss/b-ark-ui-electron';
import {
  buildStartupTaskScript,
  createStartupTaskController,
  parseStartupTaskOutput,
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
