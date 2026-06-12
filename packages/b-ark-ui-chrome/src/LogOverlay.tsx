// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { AccountConfig, BackendContext, LogEntry } from '@b-oss/b-ark-ui-components';
import { LogPanel } from '@b-oss/b-ark-ui-components';

interface LogOverlayProps {
  accounts: AccountConfig[];
  liveLogBuffer: Record<string, LogEntry[]>;
  backend: BackendContext;
  onClose: () => void;
}

export function LogOverlay({ accounts, liveLogBuffer, backend, onClose }: LogOverlayProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <LogPanel
        accounts={accounts}
        liveLogBuffer={liveLogBuffer}
        onClose={onClose}
        getLogs={() => backend.getLogs()}
        exportLogsCsv={(filters) => backend.exportLogsCsv(filters)}
      />
    </div>
  );
}
