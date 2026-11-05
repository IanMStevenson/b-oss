// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { StartupTaskInfo, StartupTaskState } from '@b-oss/b-ark-ui-electron';

/** Must match TaskId in msix/startup-task-extension.xml. */
export const STARTUP_TASK_ID = 'BArkStartup';

/** Must match `appx.applicationId` in electron-builder.store.json (checked by a test). */
export const STARTUP_TASK_APP_ID = 'bark';

export type StartupTaskOp = 'read' | 'enable' | 'disable';

/**
 * Package family name (`<identity name>_<publisher hash>`) from the path of the packaged exe,
 * e.g. `C:\Program Files\WindowsApps\ImsTest.b-ark_1.0.7.0_x64__bgf47mq2ba09r\app\b-ark.exe`
 * gives `ImsTest.b-ark_bgf47mq2ba09r`. Null when the path is not inside a WindowsApps package.
 */
export function packageFamilyNameFromExePath(exePath: string): string | null {
  const match = /[\\/]WindowsApps[\\/]([^\\/]+)[\\/]/i.exec(exePath);
  const parts = match?.[1]?.split('_');
  // <name>_<version>_<arch>_<resource id (often empty)>_<publisher id>
  if (!parts || parts.length < 5) return null;
  const name = parts[0];
  const publisher = parts[parts.length - 1];
  return name && publisher ? `${name}_${publisher}` : null;
}

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
  return (match && STATE_BY_NAME[match[1]]) || 'unknown';
}

/**
 * Windows PowerShell 5.1 script that talks to the WinRT StartupTask API. It needs the app's package
 * identity, so it is run inside the package (see buildInvokeInPackageScript).
 */
export function buildStartupTaskScript(
  op: StartupTaskOp,
  taskId = STARTUP_TASK_ID,
  /** When set, the result (or `ERROR=<message>`) is written to this file instead of stdout. */
  outFile?: string,
): string {
  const action =
    op === 'enable'
      ? "if ($task.State -eq 'Disabled') { [void](Await ($task.RequestEnableAsync()) ([Windows.ApplicationModel.StartupTaskState])) }"
      : op === 'disable'
        ? "if ($task.State -eq 'Enabled') { $task.Disable() }"
        : '';
  const body = [
    'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
    '[void][Windows.ApplicationModel.StartupTask, Windows.ApplicationModel, ContentType = WindowsRuntime]',
    "$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1",
    'function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); [void]$t.Wait(-1); $t.Result }',
    `$task = Await ([Windows.ApplicationModel.StartupTask]::GetAsync('${taskId}')) ([Windows.ApplicationModel.StartupTask])`,
    action,
    // Re-read: the first instance can be stale after Disable().
    `$task = Await ([Windows.ApplicationModel.StartupTask]::GetAsync('${taskId}')) ([Windows.ApplicationModel.StartupTask])`,
    "$result = 'STATE=' + $task.State",
  ].filter((l) => l !== '');
  if (outFile === undefined) {
    return ["$ErrorActionPreference = 'Stop'", ...body, 'Write-Output $result'].join('\n');
  }
  const file = outFile.replace(/'/g, "''");
  return [
    "$ErrorActionPreference = 'Stop'",
    'try {',
    ...body,
    `Set-Content -LiteralPath '${file}' -Value $result -Encoding ASCII`,
    '} catch {',
    `Set-Content -LiteralPath '${file}' -Value ('ERROR=' + $_.Exception.Message) -Encoding ASCII`,
    '}',
  ].join('\n');
}

/**
 * Outer script (run by an ordinary Windows PowerShell) that starts `innerEncoded` (a base64
 * UTF-16 PowerShell script) INSIDE the app's package. A child that Node spawns does not get the
 * package identity (verified on a real install: GetAsync fails with "Element not found" and
 * "The process has no package identity"), but one started with Invoke-CommandInDesktopPackage
 * does, and then finds the manifest's startup task.
 */
export function buildInvokeInPackageScript(
  packageFamilyName: string,
  appId: string,
  innerEncoded: string,
): string {
  const q = (v: string): string => v.replace(/'/g, "''");
  return [
    "$ErrorActionPreference = 'Stop'",
    `Invoke-CommandInDesktopPackage -PackageFamilyName '${q(packageFamilyName)}' -AppId '${q(appId)}' -Command 'powershell.exe' -Args '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -EncodedCommand ${innerEncoded}'`,
  ].join('\n');
}

/** Thin seam over Windows; the real one is PowerShell, tests use a fake. */
export interface StartupTaskDriver {
  read: () => Promise<StartupTaskState>;
  requestEnable: () => Promise<StartupTaskState>;
  disable: () => Promise<StartupTaskState>;
}

export interface StartupTaskController {
  /** Current state; never rejects (a failed read is `unknown`). */
  get: () => Promise<StartupTaskInfo>;
  /**
   * Make Windows match `wanted` as far as an app is allowed to. DisabledByUser/ByPolicy cannot be
   * changed by the app and are reported back so the UI can say so.
   */
  set: (wanted: boolean) => Promise<StartupTaskInfo>;
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
    // One Windows call each (every call opens a short-lived process): the script itself enables
    // only a plain Disabled task and disables only an Enabled one, so blocked states come back
    // unchanged for the UI to explain.
    set: (wanted) =>
      wanted
        ? safe(() => driver.requestEnable(), 'enable')
        : safe(() => driver.disable(), 'disable'),
  };
}
