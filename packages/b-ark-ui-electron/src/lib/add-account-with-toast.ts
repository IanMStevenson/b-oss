// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { Toast } from '../context/reducer.js';

type AddFn = () => Promise<void>;
type ShowToast = (level: Toast['level'], message: string) => void;

/**
 * The main process throws `OAuthCancelledError` for user-driven cancellation
 * (Blipfoto Cancel button, closed OAuth window, etc.). Electron's IPC layer
 * serialises rejections so that the original error's `name` and `message`
 * appear concatenated in the renderer-side `Error.message` field — e.g.
 *
 *   "Error invoking remote method 'addAccount': OAuthCancelledError: Sign-in cancelled"
 *
 * We detect that prefix verbatim. The token is also exported from main as
 * `OAUTH_CANCELLED_NAME` so the two stay in sync if either side is renamed.
 */
const CANCELLED_MARKER = 'OAuthCancelledError';

/**
 * Wrap an OAuth-driving backend call. Cancellations surface as an info toast;
 * other errors as an error toast. The promise always resolves so callers can
 * use simple fire-and-forget invocation.
 */
export async function addAccountWithToast(addFn: AddFn, showToast: ShowToast): Promise<void> {
  try {
    await addFn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes(CANCELLED_MARKER)) {
      showToast('info', 'Sign-in cancelled.');
    } else {
      showToast('error', stripIpcPrefix(message));
    }
  }
}

function stripIpcPrefix(message: string): string {
  // Electron IPC wraps thrown errors with "Error invoking remote method 'X': "
  const match = /Error invoking remote method '[^']+':\s*(?:Error:\s*)?(.+)$/s.exec(message);
  return match?.[1]?.trim() ?? message;
}
