// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import { ErrorLog, formatLine, parseErrorEntry, type LogFs } from '../error-log.js';
import { redact } from '../../shared/redact.js';
import { REDACTION_CASES } from '../../shared/redact-cases.js';

/** An in-memory filesystem recording what rotation does. */
function memoryFs(): { fs: LogFs; files: Map<string, string> } {
  const files = new Map<string, string>();
  const fs: LogFs = {
    append: (f, t) => {
      files.set(f, (files.get(f) ?? '') + t);
      return Promise.resolve();
    },
    size: (f) => Promise.resolve(files.get(f)?.length ?? 0),
    rename: (a, b) => {
      const v = files.get(a);
      if (v !== undefined) {
        files.set(b, v);
        files.delete(a);
      }
      return Promise.resolve();
    },
    remove: (f) => {
      files.delete(f);
      return Promise.resolve();
    },
  };
  return { fs, files };
}

const when = new Date('2026-10-30T12:00:00.000Z');

describe('redact', () => {
  for (const { name, input, mustNotContain } of REDACTION_CASES) {
    it(`removes the secret: ${name}`, () => {
      const out = redact(input);
      for (const secret of mustNotContain) expect(out).not.toContain(secret);
      expect(out).toContain('[redacted]');
    });
  }

  it('leaves ordinary diagnostics alone', () => {
    const text =
      "TypeError: Cannot read properties of undefined (reading 'coords') at app://b-mobile/assets/index.js:1:20";
    expect(redact(text)).toBe(text);
  });
});

describe('formatLine / parseErrorEntry', () => {
  it('writes redacted single-line JSON', () => {
    const line = formatLine(
      { source: 'boundary', message: 'failed: access_token=abcdef123456', stack: 'at x\nat y' },
      when,
    );
    expect(line).not.toContain('\n');
    expect(line).not.toContain('abcdef123456');
    expect(JSON.parse(line)).toMatchObject({ time: when.toISOString(), source: 'boundary' });
  });

  it('rejects malformed entries and clips oversized ones', () => {
    expect(parseErrorEntry(null)).toBeNull();
    expect(parseErrorEntry({ source: 1, message: 'x' })).toBeNull();
    expect(
      parseErrorEntry({ source: 's', message: 'm'.repeat(10_000) })?.message.length,
    ).toBeLessThan(2_100);
  });
});

describe('ErrorLog rotation', () => {
  const entry = { source: 's', message: 'm'.repeat(100) };
  const pathOf = (n: string): string => `/logs/${n}`;

  it('appends to app.log below the cap', async () => {
    const { fs, files } = memoryFs();
    const log = new ErrorLog(fs, pathOf, 10_000);
    await log.write(entry, when);
    await log.write(entry, when);
    expect(files.get('/logs/app.log')?.trim().split('\n')).toHaveLength(2);
    expect([...files.keys()]).toEqual(['/logs/app.log']);
  });

  it('rotates at the cap and keeps three files, dropping the oldest', async () => {
    const { fs, files } = memoryFs();
    const log = new ErrorLog(fs, pathOf, 400);
    for (let i = 0; i < 40; i++)
      await log.write({ ...entry, message: `n${i} ${entry.message}` }, when);
    expect([...files.keys()].sort()).toEqual([
      '/logs/app.log',
      '/logs/app.log.1',
      '/logs/app.log.2',
    ]);
    for (const text of files.values()) expect(text.length).toBeLessThanOrEqual(400);
    // Newest in app.log, older in .1 then .2; the very first entries are gone.
    const all = ['app.log', 'app.log.1', 'app.log.2']
      .map((n) => files.get(`/logs/${n}`) ?? '')
      .join('');
    expect(all).toContain('n39 ');
    expect(all).not.toContain('"n0 ');
    expect(files.get('/logs/app.log')).toContain('n39 ');
  });

  it('never rejects when the filesystem fails', async () => {
    const { fs } = memoryFs();
    const log = new ErrorLog(
      { ...fs, append: () => Promise.reject(new Error('disk full')) },
      pathOf,
    );
    await expect(log.write(entry, when)).resolves.toBeUndefined();
    await expect(log.write(entry, when)).resolves.toBeUndefined();
  });
});
