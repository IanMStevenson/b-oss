// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Presentational state types shared by the kit's components and the host
// shells. The host reducer/state owns the instances; these are the shapes the
// pure components consume as props.

import type { BackupPhase } from './backend.js';

export interface BackupProgress {
  running: boolean;
  kind: 'first' | 'routine' | null;
  phase: BackupPhase | null;
  done: number;
  total: number;
  current_date: string;
  rate_limited_seconds: number | null;
  total_archived: number | null;
}

export interface Toast {
  id: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}
