// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

/**
 * Microsoft Store (MSIX) builds start at sign-in through a Windows "startup task" whose state lives
 * in Windows, not in b-ark. This is the shared vocabulary for that state plus the pure mapping from
 * state to the warning (if any) the UI shows. `unknown` means Windows could not be asked.
 */
export type StartupTaskState =
  | 'enabled'
  | 'enabled-by-policy'
  | 'disabled'
  | 'disabled-by-user'
  | 'disabled-by-policy'
  | 'unknown';

export interface StartupTaskInfo {
  state: StartupTaskState;
}

/** `enable` asks Windows to turn the task on; `open_settings` opens Windows Settings > Apps > Startup. */
export type StartupTaskAction = 'enable' | 'open_settings';

export interface StartupTaskWarning {
  headline: string;
  text: string;
  action: StartupTaskAction;
  actionLabel: string;
}

const SETTINGS_PATH = 'Windows Settings → Apps → Startup';

/**
 * The warning to show, or null when nothing is wrong. Only warns when the user has Scheduled backups on, which
 * means b-ark should start with Windows (`wanted`): with the setting off, a disabled task is exactly what they asked for.
 * Every non-null result carries exactly one action.
 */
export function describeStartupTask(
  info: StartupTaskInfo | null,
  wanted: boolean,
): StartupTaskWarning | null {
  if (info === null || !wanted) return null;
  const consequence = 'Scheduled backups only run while b-ark is running.';
  switch (info.state) {
    case 'enabled':
    case 'enabled-by-policy':
      return null;
    case 'disabled':
      return {
        headline: 'b-ark will not start when you sign in to Windows',
        text: `${consequence} Starting with Windows is switched off in Windows.`,
        action: 'enable',
        actionLabel: 'Allow b-ark to start with Windows',
      };
    case 'disabled-by-user':
      return {
        headline: 'Windows is stopping b-ark from starting when you sign in',
        text: `${consequence} It was switched off in Task Manager or Windows Settings, and an app cannot switch itself back on. Open ${SETTINGS_PATH}, find b-ark and turn it on.`,
        action: 'open_settings',
        actionLabel: 'Open Windows Startup settings',
      };
    case 'disabled-by-policy':
      return {
        headline: 'Your organisation blocks b-ark from starting when you sign in',
        text: `${consequence} A Windows policy has disabled it. Open ${SETTINGS_PATH} to see the setting; you may need your IT administrator to allow it.`,
        action: 'open_settings',
        actionLabel: 'Open Windows Startup settings',
      };
    case 'unknown':
      return {
        headline: 'b-ark could not check whether it starts when you sign in',
        text: `${consequence} Open ${SETTINGS_PATH} and make sure b-ark is turned on.`,
        action: 'open_settings',
        actionLabel: 'Open Windows Startup settings',
      };
  }
}
