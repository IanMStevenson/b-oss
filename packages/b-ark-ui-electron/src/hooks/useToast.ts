// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useCallback } from 'react';
import { useApp } from '../context/AppContext.js';
import type { Toast } from '../context/reducer.js';

export function useToast(): (level: Toast['level'], message: string) => void {
  const { backend, dispatch } = useApp();
  return useCallback(
    (level, message) => {
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      dispatch({ type: 'toast:show', toast: { id, level, message } });
      // Keep a copy of errors in the backup folder's log: the toast may be gone
      // (or never read) by the time anyone wants the exact text (b-oss#985).
      if (level === 'error') void backend.logAppError?.(message)?.catch(() => undefined);
    },
    [backend, dispatch],
  );
}
