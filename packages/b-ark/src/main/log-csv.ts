// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { LogEntry } from '@b-oss/b-ark-ui';

const HEADER = ['timestamp', 'level', 'account_id', 'username', 'backup_id', 'message'];

/**
 * Escape a value for CSV output per RFC 4180: double any embedded quotes and
 * wrap in quotes if the value contains comma, quote, CR, or LF.
 */
function escapeCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Serialize a list of log entries as CSV. Resolves account_id → username
 * via the provided map (empty string when unknown).
 */
export function toCsv(entries: LogEntry[], usernameById: Map<string, string>): string {
  const lines: string[] = [HEADER.join(',')];
  for (const e of entries) {
    const row = [
      e.timestamp,
      e.level,
      e.account_id,
      usernameById.get(e.account_id) ?? '',
      e.backup_id ?? '',
      e.message,
    ].map(escapeCell);
    lines.push(row.join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
