// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Electron container for the shared LogPanel: wires the reducer's accounts +
// live log buffers and the backend's log read/export to the pure panel.
// Callbacks are memoised on the backend so the kit's mount-load effect runs
// once (not on every render). Presentation lives in @b-oss/b-ark-ui-components.
import { useCallback } from 'react';
import { LogPanel as LogPanelView } from '@b-oss/b-ark-ui-components';
import type { LogCsvFilters } from '../../backend.js';
import { useApp } from '../../context/AppContext.js';

export function LogPanel() {
  const { state, dispatch, backend } = useApp();
  const getLogs = useCallback(() => backend.getLogs(), [backend]);
  const exportLogsCsv = useCallback(
    (filters: LogCsvFilters) => backend.exportLogsCsv(filters),
    [backend],
  );
  const onClose = useCallback(() => dispatch({ type: 'panel:close' }), [dispatch]);

  return (
    <LogPanelView
      accounts={state.store?.accounts ?? []}
      liveLogBuffer={state.logBuffer}
      onClose={onClose}
      getLogs={getLogs}
      exportLogsCsv={exportLogsCsv}
    />
  );
}
