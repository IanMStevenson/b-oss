// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { app, shell } from 'electron';
import log from 'electron-log';
import type { StartupTaskInfo } from '@b-oss/b-ark-ui-electron';
import {
  buildInvokeInPackageScript,
  buildStartupTaskScript,
  createStartupTaskController,
  packageFamilyNameFromExePath,
  parseStartupTaskOutput,
  STARTUP_TASK_APP_ID,
  STARTUP_TASK_ID,
  type StartupTaskController,
  type StartupTaskDriver,
  type StartupTaskOp,
} from './startup-task-pure.js';

// Microsoft Store (MSIX) installs ignore the registry Run key that app.setLoginItemSettings writes;
// start at sign-in is a manifest startupTask whose state Windows owns. We read and change it via
// the WinRT StartupTask API, which needs the package identity. A PowerShell that Node spawns does
// NOT get that identity (verified on a real install, b-oss#805), so an ordinary PowerShell starts a
// second one inside the package with Invoke-CommandInDesktopPackage. That cannot return stdout,
// so the inner script writes its result to a file in the Public folder (outside the package's
// AppData redirection), which we poll and delete. No native add-on: the NodeRT bindings behind
// electron-winstore-auto-launch are unmaintained and won't build for Electron 45.
// The in-package route itself was checked by hand on a real install; the full app path is still
// UNVERIFIED until the next sideload round.

const RESULT_TIMEOUT_MS = 20_000;
const POLL_MS = 200;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function windowsPowerShell(): string {
  return join(
    process.env['SystemRoot'] ?? 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
}

function runPowerShell(script: string): Promise<void> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve, reject) => {
    execFile(
      windowsPowerShell(),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { timeout: RESULT_TIMEOUT_MS, windowsHide: true },
      (err, _stdout, stderr) => {
        if (err) reject(new Error(`${err.message}\n${stderr}`));
        else resolve();
      },
    );
  });
}

async function runInPackage(op: StartupTaskOp): Promise<string> {
  const family = packageFamilyNameFromExePath(process.execPath);
  if (!family) throw new Error(`Not running from a WindowsApps package: ${process.execPath}`);
  const outFile = join(
    process.env['PUBLIC'] ?? 'C:\\Users\\Public',
    `b-ark-startup-${randomUUID()}.txt`,
  );
  const inner = Buffer.from(buildStartupTaskScript(op, STARTUP_TASK_ID, outFile), 'utf16le');
  await runPowerShell(
    buildInvokeInPackageScript(family, STARTUP_TASK_APP_ID, inner.toString('base64')),
  );
  const deadline = Date.now() + RESULT_TIMEOUT_MS;
  try {
    for (;;) {
      try {
        const text = await readFile(outFile, 'ascii');
        if (text.trim() !== '') {
          if (text.startsWith('ERROR=')) throw new Error(text.trim());
          return text;
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
      if (Date.now() > deadline) throw new Error('Timed out waiting for the startup-task result');
      await sleep(POLL_MS);
    }
  } finally {
    await unlink(outFile).catch(() => undefined);
  }
}

const powerShellDriver: StartupTaskDriver = {
  read: () => runInPackage('read').then(parseStartupTaskOutput),
  requestEnable: () => runInPackage('enable').then(parseStartupTaskOutput),
  disable: () => runInPackage('disable').then(parseStartupTaskOutput),
};

/** Only a Microsoft Store install uses the startup task. */
export const isStoreBuild = (): boolean => process.windowsStore === true;

const controller: StartupTaskController = createStartupTaskController(
  powerShellDriver,
  (message, err) => log.warn(message, err),
);

// Every Windows call starts a short-lived PowerShell inside the package, so keep them rare: share
// one in-flight call, and reuse a recent answer.
const CACHE_MS = 15_000;
let cached: { info: StartupTaskInfo; at: number } | null = null;
let inflight: Promise<StartupTaskInfo> | null = null;

function remember(info: StartupTaskInfo): StartupTaskInfo {
  cached = { info, at: Date.now() };
  return info;
}

async function readState(): Promise<StartupTaskInfo> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.info;
  inflight ??= controller
    .get()
    .then(remember)
    .finally(() => (inflight = null));
  return inflight;
}

let launchReconcile: Promise<unknown> = Promise.resolve();

/** Make the sign-in behaviour match Scheduled (the master setting). Store: startup task; otherwise: Run key. */
export async function applyStartAtSignIn(wanted: boolean): Promise<void> {
  if (isStoreBuild()) {
    const info = remember(await controller.set(wanted));
    log.info(`Startup task state after applying scheduled=${wanted}: ${info.state}`);
  } else if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: wanted });
  }
}

/**
 * At launch: with Scheduled on, make the sign-in behaviour match (one Windows call, whose answer
 * also feeds the banner). With Scheduled off in a Store build there is nothing to check or change
 * until the user turns Scheduled on.
 */
export function reconcileStartAtSignInOnLaunch(wanted: boolean): void {
  if (isStoreBuild() && !wanted) return;
  launchReconcile = applyStartAtSignIn(wanted).catch((err: unknown) =>
    log.warn('Startup reconcile failed', err),
  );
}

/** `scheduled` false: nothing is wanted, so the banner has nothing to say and Windows isn't asked. */
export async function getStartupTaskInfo(scheduled: boolean): Promise<StartupTaskInfo | null> {
  if (!isStoreBuild() || !scheduled) return null;
  await launchReconcile;
  return readState();
}

export async function enableStartupTask(): Promise<StartupTaskInfo | null> {
  if (!isStoreBuild()) return null;
  return remember(await controller.set(true));
}

export async function openStartupSettings(): Promise<void> {
  await shell.openExternal('ms-settings:startupapps');
}
