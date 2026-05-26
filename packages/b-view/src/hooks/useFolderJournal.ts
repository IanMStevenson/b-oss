// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useState, useEffect } from 'react';
import type { JournalMetadata } from '../types.js';
import type { JournalState } from './useJournal.js';
import { getNestedFileHandle } from './useFolderAccess.js';

export function useFolderJournal(dirHandle: FileSystemDirectoryHandle | null): JournalState {
  const [state, setState] = useState<JournalState>({ status: 'loading' });

  useEffect(() => {
    if (!dirHandle) {
      setState({ status: 'loading' });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    getNestedFileHandle(dirHandle, 'journal.json')
      .then((fh) => fh.getFile())
      .then((file) => file.text())
      .then((text) => {
        if (cancelled) return;
        const data = JSON.parse(text) as JournalMetadata;
        if (data.schema_version !== 1) {
          throw new Error(`Unsupported journal schema version: ${String(data.schema_version)}`);
        }
        setState({ status: 'loaded', data });
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
  }, [dirHandle]);

  return state;
}
