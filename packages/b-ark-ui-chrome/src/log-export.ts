// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Pure CSV export for the backup log — filter + serialise, no I/O.

import type { LogEntry, LogCsvFilters } from '@b-oss/b-ark-ui-components';

function csvEscape(s: string): string {
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Filter the log entries and render them as CSV; returns null when nothing matches. */
export function buildLogsCsv(logs: LogEntry[], filters: LogCsvFilters): string | null {
  const filtered = logs.filter((e) => {
    if (filters.account_id && e.account_id !== filters.account_id) return false;
    if (filters.backup_id && e.backup_id !== filters.backup_id) return false;
    if (filters.level !== 'all' && e.level !== filters.level) return false;
    return true;
  });
  if (filtered.length === 0) return null;
  const header = 'id,backup_id,account_id,timestamp,level,message';
  const rows = filtered.map((e) =>
    [
      csvEscape(e.id),
      csvEscape(e.backup_id ?? ''),
      csvEscape(e.account_id),
      csvEscape(e.timestamp),
      csvEscape(e.level),
      csvEscape(e.message),
    ].join(','),
  );
  return [header, ...rows].join('\n');
}
