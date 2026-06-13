// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { BackupErrorPayload } from './types.js';

export class BackupAbortedError extends Error {
  constructor(public readonly payload: BackupErrorPayload) {
    super(payload.kind);
    this.name = 'BackupAbortedError';
  }
}

export class BackupCancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'BackupCancelledError';
  }
}
