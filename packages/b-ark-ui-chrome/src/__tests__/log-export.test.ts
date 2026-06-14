// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import type { LogEntry } from '@b-oss/b-ark-ui-components';
import { buildLogsCsv } from '../log-export.js';

function entry(over: Partial<LogEntry>): LogEntry {
  return {
    id: '1',
    account_id: 'gbradley',
    timestamp: '2024-01-01T00:00:00Z',
    level: 'info',
    message: 'hello',
    ...over,
  };
}

describe('buildLogsCsv', () => {
  it('returns null when nothing matches', () => {
    expect(buildLogsCsv([], { account_id: null, backup_id: null, level: 'all' })).toBeNull();
    expect(
      buildLogsCsv([entry({ level: 'info' })], {
        account_id: null,
        backup_id: null,
        level: 'error',
      }),
    ).toBeNull();
  });

  it('emits a header and one row per matching entry', () => {
    const csv = buildLogsCsv([entry({ id: 'a' }), entry({ id: 'b' })], {
      account_id: null,
      backup_id: null,
      level: 'all',
    });
    const lines = csv!.split('\n');
    expect(lines[0]).toBe('id,backup_id,account_id,timestamp,level,message');
    expect(lines).toHaveLength(3);
  });

  it('filters by account, backup and level', () => {
    const logs = [
      entry({ id: 'a', account_id: 'x', backup_id: 'b1', level: 'info' }),
      entry({ id: 'b', account_id: 'y', backup_id: 'b1', level: 'error' }),
      entry({ id: 'c', account_id: 'x', backup_id: 'b2', level: 'error' }),
    ];
    const csv = buildLogsCsv(logs, { account_id: 'x', backup_id: 'b2', level: 'error' });
    expect(csv).not.toBeNull();
    expect(csv!.split('\n')).toHaveLength(2); // header + the single match (id c)
    expect(csv!.split('\n')[1]).toBe('c,b2,x,2024-01-01T00:00:00Z,error,hello');
  });

  it('escapes commas, quotes and newlines', () => {
    const csv = buildLogsCsv([entry({ message: 'a,"b"\nc' })], {
      account_id: null,
      backup_id: null,
      level: 'all',
    });
    expect(csv).toContain('"a,""b""\nc"');
  });
});
