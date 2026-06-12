// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useCallback } from 'react';
import { useApp } from '../context/AppContext.js';
import type { Toast } from '../context/reducer.js';

export function useToast(): (level: Toast['level'], message: string) => void {
  const { dispatch } = useApp();
  return useCallback(
    (level, message) => {
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      dispatch({ type: 'toast:show', toast: { id, level, message } });
    },
    [dispatch],
  );
}
