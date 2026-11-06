// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Start at sign-in in a Microsoft Store (MSIX) install (b-oss#884). An MSIX app ignores the login-item
// registry key, so notifications-on is carried by a manifest startup task (msix/startup-task-extension.xml)
// that only the WinRT API can read and change. That API is b-ark's native add-on
// (packages/b-ark/native/win-startup, taskId passed in), packed beside the app by
// electron-builder.store.json. Pure: the add-on is injected, so this runs in tests on any OS.

/** Must match TaskId in msix/startup-task-extension.xml. */
export const STARTUP_TASK_ID = 'BMobilePcStartup';

/** The add-on's surface; each call resolves to a Windows.ApplicationModel.StartupTaskState name. */
export interface StartupTaskAddon {
  getState: (taskId: string) => Promise<string>;
  enable: (taskId: string) => Promise<string>;
  disable: (taskId: string) => Promise<string>;
}

/**
 * Load the add-on through `load` (a typed require in production). A missing file, a failed load or a
 * module of the wrong shape is non-fatal: it returns null and the start-at-sign-in change is skipped.
 */
export function loadStartupAddon(
  load: () => unknown,
  onError: (message: string, err: unknown) => void,
): StartupTaskAddon | null {
  try {
    const m = load() as Partial<StartupTaskAddon> | null;
    if (
      m &&
      typeof m.getState === 'function' &&
      typeof m.enable === 'function' &&
      typeof m.disable === 'function'
    ) {
      return m as StartupTaskAddon;
    }
    onError('Startup-task add-on has an unexpected shape', m);
  } catch (err) {
    onError('Startup-task add-on failed to load', err);
  }
  return null;
}

/**
 * Make the startup task match `wanted` and report the resulting state name (or why nothing
 * happened). The add-on itself enables only a plain Disabled task and disables only an Enabled one,
 * so a task the user or an administrator turned off comes back unchanged: an app cannot re-enable it.
 */
export async function applyStartupTask(
  addon: StartupTaskAddon | null,
  wanted: boolean,
  onError: (message: string, err: unknown) => void,
): Promise<string> {
  if (!addon) return 'add-on unavailable';
  try {
    return await (wanted ? addon.enable(STARTUP_TASK_ID) : addon.disable(STARTUP_TASK_ID));
  } catch (err) {
    onError(`Startup task ${wanted ? 'enable' : 'disable'} failed`, err);
    return 'error';
  }
}
