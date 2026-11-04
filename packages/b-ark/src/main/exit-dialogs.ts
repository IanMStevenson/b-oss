// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { dialog, type BrowserWindow } from 'electron';
import type { ExitDialogs } from './exit-policy.js';

/** The real Electron implementation of the dialog seam used by exit-policy.ts. */
export function electronExitDialogs(parent: BrowserWindow | null): ExitDialogs {
  return {
    async confirm({ message, detail, confirmLabel, cancelLabel }) {
      const options: Electron.MessageBoxOptions = {
        type: 'warning',
        message,
        detail,
        buttons: [confirmLabel, cancelLabel],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      };
      const result =
        parent && !parent.isDestroyed() && parent.isVisible()
          ? await dialog.showMessageBox(parent, options)
          : await dialog.showMessageBox(options);
      return result.response === 0;
    },
  };
}
