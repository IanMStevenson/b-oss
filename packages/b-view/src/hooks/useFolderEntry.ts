// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useState, useEffect } from 'react';
import type { BlipEntry } from '../types.js';
import type { EntryState } from './useEntry.js';
import { getNestedFileHandle } from './useFolderAccess.js';

export function useFolderEntry(
  dirHandle: FileSystemDirectoryHandle | null,
  jsonPath: string | null,
): EntryState {
  const [state, setState] = useState<EntryState>({ status: 'idle' });

  useEffect(() => {
    if (!dirHandle || jsonPath === null) {
      setState({ status: 'idle' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    getNestedFileHandle(dirHandle, jsonPath)
      .then((fh) => fh.getFile())
      .then((file) => file.text())
      .then((text) => {
        if (cancelled) return;
        setState({ status: 'loaded', data: JSON.parse(text) as BlipEntry });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [dirHandle, jsonPath]);

  return state;
}
