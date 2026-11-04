// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// What closing the window or choosing the tray's Exit does, as pure decisions plus a thin
// "dialog seam" so the Electron part (dialog.showMessageBox, app.quit) is faked in tests.
//
// Only the two USER gestures below ever prompt. OS shutdown, sign-out and update-install quits
// never go through them: they reach the app as `before-quit` / `session-end`, where nothing here
// runs (see index.ts), so they can never be blocked by a dialog.

export interface ExitContext {
  /** The Scheduled setting. */
  scheduled: boolean;
  backupRunning: boolean;
}

export type CloseDecision = 'hide' | 'exit' | 'ask-abort';
export type TrayExitDecision = 'exit' | 'confirm' | 'ask-abort';

/** The user closed the window. Scheduled keeps b-ark in the tray; otherwise closing means exit. */
export function decideWindowClose({ scheduled, backupRunning }: ExitContext): CloseDecision {
  if (scheduled) return 'hide';
  return backupRunning ? 'ask-abort' : 'exit';
}

/** The user chose Exit in the tray menu. */
export function decideTrayExit({ scheduled, backupRunning }: ExitContext): TrayExitDecision {
  if (backupRunning) return 'ask-abort';
  return scheduled ? 'confirm' : 'exit';
}

export const SCHEDULED_EXIT_WARNING =
  'If you exit, scheduled backups are disabled until your computer restarts or you re-open b-ark.';
export const ABORT_WARNING = 'A backup is running and will be aborted if you exit now.';

export interface ExitDialogs {
  /** One dialog, two buttons. Resolves true when the user picked the first (destructive) one. */
  confirm(opts: {
    message: string;
    detail?: string;
    confirmLabel: string;
    cancelLabel: string;
  }): Promise<boolean>;
}

/** Returns true when the app should now quit. */
export async function resolveWindowClose(
  ctx: ExitContext,
  dialogs: ExitDialogs,
): Promise<'hide' | 'exit' | 'stay'> {
  const d = decideWindowClose(ctx);
  if (d === 'hide' || d === 'exit') return d;
  const abort = await dialogs.confirm({
    message: ABORT_WARNING,
    confirmLabel: 'Abort and Exit',
    cancelLabel: 'Continue Backup',
  });
  return abort ? 'exit' : 'stay';
}

/** True when the app should quit. One dialog even when both warnings apply. */
export async function resolveTrayExit(ctx: ExitContext, dialogs: ExitDialogs): Promise<boolean> {
  const d = decideTrayExit(ctx);
  if (d === 'exit') return true;
  if (d === 'confirm') {
    return dialogs.confirm({
      message: SCHEDULED_EXIT_WARNING,
      confirmLabel: 'Exit',
      cancelLabel: 'Cancel',
    });
  }
  return dialogs.confirm({
    message: ABORT_WARNING,
    detail: ctx.scheduled ? SCHEDULED_EXIT_WARNING : undefined,
    confirmLabel: 'Abort and Exit',
    cancelLabel: 'Continue Backup',
  });
}
