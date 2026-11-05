// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

/**
 * Whether b-ark starts when the user signs in, as the operating system reports it. Platform-neutral:
 * the main process maps whatever the platform says (a Windows startup task, a macOS login item,
 * the Electron login-item flag) onto these states and supplies the wording for where to fix it.
 *
 * - `on`: will start at sign-in.
 * - `off`: switched off, and b-ark may switch it on again (the `enable` action).
 * - `needs-user-action`: the user has to switch it on (or approve it) in the system's settings;
 *   an app cannot do that itself.
 * - `blocked-by-policy`: an administrator or policy prevents it.
 * - `unknown`: the system could not be asked.
 */
export type StartupTaskState = 'on' | 'off' | 'needs-user-action' | 'blocked-by-policy' | 'unknown';

/** Where the user can fix the setting; supplied by the main process for the platform. */
export interface StartupSettingsLocation {
  /** Menu path in words, e.g. `Windows Settings → Apps → Startup`. */
  path: string;
  /** Label of the button that opens it, e.g. `Open Windows Startup settings`. */
  openLabel: string;
}

export interface StartupTaskInfo {
  state: StartupTaskState;
  settings: StartupSettingsLocation;
}

/** `enable` asks the system to turn it on; `open_settings` opens the platform's settings page. */
export type StartupTaskAction = 'enable' | 'open_settings';

export interface StartupTaskWarning {
  headline: string;
  text: string;
  action: StartupTaskAction;
  actionLabel: string;
}

/**
 * The warning to show, or null when nothing is wrong. Only warns when the user has Scheduled backups on, which
 * means b-ark should start at sign-in (`wanted`): with the setting off, "off" is exactly what they asked for.
 * Every non-null result carries exactly one action.
 */
export function describeStartupTask(
  info: StartupTaskInfo | null,
  wanted: boolean,
): StartupTaskWarning | null {
  if (info === null || !wanted) return null;
  const consequence = 'Scheduled backups only run while b-ark is running.';
  const openSettings = {
    action: 'open_settings',
    actionLabel: info.settings.openLabel,
  } as const;
  switch (info.state) {
    case 'on':
      return null;
    case 'off':
      return {
        headline: 'b-ark will not start when you sign in',
        text: `${consequence} Starting when you sign in is switched off.`,
        action: 'enable',
        actionLabel: 'Allow b-ark to start when you sign in',
      };
    case 'needs-user-action':
      return {
        headline: 'Your system is stopping b-ark from starting when you sign in',
        text: `${consequence} It was switched off, or is waiting for your approval, outside b-ark, and an app cannot switch itself back on. Open ${info.settings.path}, find b-ark and turn it on.`,
        ...openSettings,
      };
    case 'blocked-by-policy':
      return {
        headline: 'Your organisation blocks b-ark from starting when you sign in',
        text: `${consequence} A policy has disabled it. Open ${info.settings.path} to see the setting; you may need your IT administrator to allow it.`,
        ...openSettings,
      };
    case 'unknown':
      return {
        headline: 'b-ark could not check whether it starts when you sign in',
        text: `${consequence} Open ${info.settings.path} and make sure b-ark is turned on.`,
        ...openSettings,
      };
  }
}
