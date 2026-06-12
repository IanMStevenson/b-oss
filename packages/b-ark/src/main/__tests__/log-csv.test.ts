// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import type { LogEntry } from '@b-oss/b-ark-ui-electron';
import { toCsv } from '../log-csv.js';

function entry(over: Partial<LogEntry>): LogEntry {
  return {
    id: 'e1',
    account_id: 'acc-1',
    timestamp: '2026-05-26T09:00:00.000Z',
    level: 'info',
    message: 'hello',
    ...over,
  };
}

describe('toCsv', () => {
  it('emits a header row followed by one row per entry', () => {
    const csv = toCsv(
      [entry({ id: 'e1', message: 'one' }), entry({ id: 'e2', message: 'two' })],
      new Map([['acc-1', 'alice']]),
    );
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('timestamp,level,account_id,username,backup_id,message');
    expect(lines).toHaveLength(3);
  });

  it('escapes embedded commas by quoting the cell', () => {
    const csv = toCsv([entry({ message: 'hello, world' })], new Map());
    expect(csv).toContain('"hello, world"');
  });

  it('escapes embedded double-quotes by doubling them', () => {
    const csv = toCsv([entry({ message: 'she said "hi"' })], new Map());
    expect(csv).toContain('"she said ""hi"""');
  });

  it('escapes embedded newlines by quoting', () => {
    const csv = toCsv([entry({ message: 'line one\nline two' })], new Map());
    expect(csv).toContain('"line one\nline two"');
  });

  it('resolves usernames via the map; empty string when unknown', () => {
    const csv = toCsv(
      [
        entry({ account_id: 'acc-1', message: 'a' }),
        entry({ account_id: 'unknown', message: 'b' }),
      ],
      new Map([['acc-1', 'alice']]),
    );
    expect(csv).toContain(',alice,');
    // unknown account → empty username column → ",,"
    expect(csv).toMatch(/,unknown,,/);
  });

  it('emits an empty backup_id cell when undefined', () => {
    const csv = toCsv([entry({ backup_id: undefined })], new Map());
    expect(csv.split('\r\n')[1]).toMatch(/,,hello$/);
  });
});
