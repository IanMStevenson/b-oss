// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { Toast } from '../context/reducer.js';

type AddFn = () => Promise<void>;
type ShowToast = (level: Toast['level'], message: string) => void;

/**
 * Wrap an OAuth-driving backend call. Cancellations surface as an info toast;
 * other errors as an error toast. Either way the promise still resolves so
 * the caller can rely on UI to update naturally.
 */
export async function addAccountWithToast(addFn: AddFn, showToast: ShowToast): Promise<void> {
  try {
    await addFn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isCancellation(message)) {
      showToast('info', 'Sign-in cancelled.');
    } else {
      showToast('error', stripIpcPrefix(message));
    }
  }
}

function isCancellation(message: string): boolean {
  return (
    message.includes('OAuthCancelledError') ||
    message.includes('Sign-in cancelled') ||
    message.includes('Sign-in window closed') ||
    message.includes('access_denied')
  );
}

function stripIpcPrefix(message: string): string {
  // Electron IPC wraps thrown errors with "Error invoking remote method 'X': "
  const match = /Error invoking remote method '[^']+':\s*(?:Error:\s*)?(.+)$/s.exec(message);
  return match?.[1]?.trim() ?? message;
}
