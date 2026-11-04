// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { StartupTaskInfo, StartupTaskState } from '@b-oss/b-ark-ui-electron';

/** Must match TaskId in msix/startup-task-extension.xml. */
export const STARTUP_TASK_ID = 'BArkStartup';

export type StartupTaskOp = 'read' | 'enable' | 'disable';

/** Windows.ApplicationModel.StartupTaskState names, as PowerShell prints the enum. */
const STATE_BY_NAME: Record<string, StartupTaskState> = {
  Enabled: 'enabled',
  EnabledByPolicy: 'enabled-by-policy',
  Disabled: 'disabled',
  DisabledByUser: 'disabled-by-user',
  DisabledByPolicy: 'disabled-by-policy',
};

/** Parse the `STATE=<name>` line the script prints; anything else is `unknown`. */
export function parseStartupTaskOutput(stdout: string): StartupTaskState {
  const match = /^STATE=(\w+)\s*$/m.exec(stdout);
  return (match && STATE_BY_NAME[match[1]!]) || 'unknown';
}

/**
 * Windows PowerShell 5.1 script that talks to the WinRT StartupTask API. It must run as a child of
 * the packaged app so it inherits the package identity (UNVERIFIED on a real install).
 */
export function buildStartupTaskScript(op: StartupTaskOp, taskId = STARTUP_TASK_ID): string {
  const action =
    op === 'enable'
      ? "if ($task.State -eq 'Disabled') { [void](Await ($task.RequestEnableAsync()) ([Windows.ApplicationModel.StartupTaskState])) }"
      : op === 'disable'
        ? '$task.Disable()'
        : '';
  return [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
    '[void][Windows.ApplicationModel.StartupTask, Windows.ApplicationModel, ContentType = WindowsRuntime]',
    "$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1",
    'function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); [void]$t.Wait(-1); $t.Result }',
    `$task = Await ([Windows.ApplicationModel.StartupTask]::GetAsync('${taskId}')) ([Windows.ApplicationModel.StartupTask])`,
    action,
    // Re-read: the first instance can be stale after Disable().
    `$task = Await ([Windows.ApplicationModel.StartupTask]::GetAsync('${taskId}')) ([Windows.ApplicationModel.StartupTask])`,
    "Write-Output ('STATE=' + $task.State)",
  ]
    .filter((l) => l !== '')
    .join('\n');
}

/** Thin seam over Windows; the real one is PowerShell, tests use a fake. */
export interface StartupTaskDriver {
  read(): Promise<StartupTaskState>;
  requestEnable(): Promise<StartupTaskState>;
  disable(): Promise<StartupTaskState>;
}

export interface StartupTaskController {
  /** Current state; never rejects (a failed read is `unknown`). */
  get(): Promise<StartupTaskInfo>;
  /**
   * Make Windows match `wanted` as far as an app is allowed to. Enables only a plain `disabled`
   * task and disables only an `enabled` one: DisabledByUser/ByPolicy cannot be changed by the app
   * and are reported back so the UI can say so.
   */
  set(wanted: boolean): Promise<StartupTaskInfo>;
}

export function createStartupTaskController(
  driver: StartupTaskDriver,
  onError: (message: string, err: unknown) => void = () => undefined,
): StartupTaskController {
  async function safe(fn: () => Promise<StartupTaskState>, what: string): Promise<StartupTaskInfo> {
    try {
      return { state: await fn() };
    } catch (err) {
      onError(`Startup task ${what} failed`, err);
      return { state: 'unknown' };
    }
  }
  return {
    get: () => safe(() => driver.read(), 'read'),
    async set(wanted) {
      const current = await safe(() => driver.read(), 'read');
      if (wanted && current.state === 'disabled')
        return safe(() => driver.requestEnable(), 'enable');
      if (!wanted && current.state === 'enabled') return safe(() => driver.disable(), 'disable');
      return current;
    },
  };
}
