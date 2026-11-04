// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { app, shell } from 'electron';
import log from 'electron-log';
import type { StartupTaskInfo } from '@b-oss/b-ark-ui-electron';
import {
  buildStartupTaskScript,
  createStartupTaskController,
  parseStartupTaskOutput,
  type StartupTaskController,
  type StartupTaskDriver,
  type StartupTaskOp,
} from './startup-task-pure.js';

// Microsoft Store (MSIX) installs ignore the registry Run key that app.setLoginItemSettings writes;
// start at sign-in is a manifest startupTask whose state Windows owns. We read and change it via
// the WinRT StartupTask API from a Windows PowerShell child process (children of a packaged
// full-trust app run with its package identity). No native add-on: the NodeRT bindings behind
// electron-winstore-auto-launch are unmaintained and won't build for Electron 45.
// UNVERIFIED on a real Windows install (b-oss#805).

function runPowerShell(op: StartupTaskOp): Promise<string> {
  const script = Buffer.from(buildStartupTaskScript(op), 'utf16le').toString('base64');
  const exe = join(
    process.env['SystemRoot'] ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  return new Promise((resolve, reject) => {
    execFile(
      exe,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', script],
      { timeout: 20_000, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) reject(new Error(`${err.message}\n${stderr}`));
        else resolve(stdout);
      },
    );
  });
}

const powerShellDriver: StartupTaskDriver = {
  read: async () => parseStartupTaskOutput(await runPowerShell('read')),
  requestEnable: async () => parseStartupTaskOutput(await runPowerShell('enable')),
  disable: async () => parseStartupTaskOutput(await runPowerShell('disable')),
};

/** Only a Microsoft Store install uses the startup task. */
export const isStoreBuild = (): boolean => process.windowsStore === true;

const controller: StartupTaskController = createStartupTaskController(
  powerShellDriver,
  (message, err) => log.warn(message, err),
);

let launchReconcile: Promise<unknown> = Promise.resolve();

/** Make the login behaviour match the user's setting. Store: startup task; otherwise: Run key. */
export async function applyStartWithWindows(wanted: boolean): Promise<void> {
  if (isStoreBuild()) {
    const info = await controller.set(wanted);
    log.info(`Startup task state after applying startWithWindows=${wanted}: ${info.state}`);
  } else if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: wanted });
  }
}

/** At launch: reconcile once, and let the renderer's first state read wait for it. */
export function reconcileStartWithWindowsOnLaunch(wanted: boolean): void {
  launchReconcile = applyStartWithWindows(wanted).catch((err: unknown) =>
    log.warn('Startup reconcile failed', err),
  );
}

export async function getStartupTaskInfo(): Promise<StartupTaskInfo | null> {
  if (!isStoreBuild()) return null;
  await launchReconcile;
  return controller.get();
}

export async function enableStartupTask(): Promise<StartupTaskInfo | null> {
  if (!isStoreBuild()) return null;
  return controller.set(true);
}

export async function openStartupSettings(): Promise<void> {
  await shell.openExternal('ms-settings:startupapps');
}
