// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { formatReport, missingEnvKeys, parseEnvFile } from '../env-check.mjs';

const example = `# Blipfoto developer app credentials
# VITE_COMMENTED_OUT=
VITE_BLIPFOTO_CLIENT_ID=
VITE_OAUTH_REDIRECT_URI=bmobile://oauth/ # optional
export VITE_GEOAPIFY_KEY=

VITE_DEV_TOKEN= # optional (dev only)
VITE_QUOTED=""
NOT A KEY=1
`;

describe('parseEnvFile', () => {
  it('reads assignments, skips comments and blanks, and splits inline comments', () => {
    expect(parseEnvFile(example).map((e) => e.name)).toEqual([
      'VITE_BLIPFOTO_CLIENT_ID',
      'VITE_OAUTH_REDIRECT_URI',
      'VITE_GEOAPIFY_KEY',
      'VITE_DEV_TOKEN',
      'VITE_QUOTED',
    ]);
    const redirect = parseEnvFile(example).find((e) => e.name === 'VITE_OAUTH_REDIRECT_URI');
    expect(redirect).toEqual({
      name: 'VITE_OAUTH_REDIRECT_URI',
      value: 'bmobile://oauth/',
      comment: 'optional',
    });
  });
  it('unquotes values, keeps a # inside a value, and handles CRLF', () => {
    const [a, b, c] = parseEnvFile('A="x y" # c\r\nB=\'q\'\r\nC=abc#def\r\n');
    expect(a).toEqual({ name: 'A', value: 'x y', comment: 'c' });
    expect(b?.value).toBe('q');
    expect(c?.value).toBe('abc#def');
  });
});

describe('missingEnvKeys', () => {
  it('reports required and optional keys that are missing, by name', () => {
    expect(missingEnvKeys(example, 'VITE_BLIPFOTO_CLIENT_ID=abc\n')).toEqual({
      required: ['VITE_GEOAPIFY_KEY', 'VITE_QUOTED'],
      optional: ['VITE_OAUTH_REDIRECT_URI', 'VITE_DEV_TOKEN'],
    });
  });
  it('counts an empty value, or a commented-out line, as missing', () => {
    const local = 'VITE_BLIPFOTO_CLIENT_ID=\n# VITE_GEOAPIFY_KEY=abc\nVITE_QUOTED="x"\n';
    expect(missingEnvKeys(example, local).required).toEqual([
      'VITE_BLIPFOTO_CLIENT_ID',
      'VITE_GEOAPIFY_KEY',
    ]);
  });
  it('is satisfied by a complete file, and by keys in the environment', () => {
    const full = 'VITE_BLIPFOTO_CLIENT_ID=a\nVITE_GEOAPIFY_KEY=b\nVITE_QUOTED=c\n';
    expect(missingEnvKeys(example, full).required).toEqual([]);
    expect(
      missingEnvKeys(example, 'VITE_BLIPFOTO_CLIENT_ID=a\nVITE_QUOTED=c', {
        VITE_GEOAPIFY_KEY: 'from-env',
      }).required,
    ).toEqual([]);
  });
  it('reports a key once even if the example lists it twice', () => {
    expect(missingEnvKeys('A=\nA=\n', '').required).toEqual(['A']);
  });
  it('a missing .env.local means every key is missing', () => {
    expect(missingEnvKeys(example, '').required).toHaveLength(3);
  });
});

describe('formatReport', () => {
  it('names the key and what it breaks, never a value', () => {
    const lines = formatReport(
      { required: ['VITE_GEOAPIFY_KEY'], optional: ['VITE_DEV_TOKEN'] },
      true,
    );
    expect(lines[0]).toBe(
      'warning: .env.local is missing VITE_GEOAPIFY_KEY (the map will show "unavailable")',
    );
    expect(lines[1]).toBe('note: .env.local has no VITE_DEV_TOKEN (optional)');
  });
  it('says so when there is no file', () => {
    expect(formatReport({ required: [], optional: [] }, false)[0]).toContain('no .env.local');
  });
});

describe('the command', () => {
  const script = resolve(fileURLToPath(import.meta.url), '../../env-check.mjs');
  const dirs = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));
  const run = (local, args = [], env = {}) => {
    const dir = mkdtempSync(join(tmpdir(), 'envcheck-'));
    dirs.push(dir);
    writeFileSync(join(dir, '.env.example'), example);
    if (local !== null) writeFileSync(join(dir, '.env.local'), local);
    return spawnSync(process.execPath, [script, '--root', dir, ...args], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, ...env },
    });
  };

  it('stops (exit 1) for a missing required key and prints names only', () => {
    const r = run('VITE_BLIPFOTO_CLIENT_ID=SECRETVALUE123\n');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('missing VITE_GEOAPIFY_KEY');
    expect(r.stderr + r.stdout).not.toContain('SECRETVALUE123');
  });
  it('passes a complete file silently', () => {
    const r = run('VITE_BLIPFOTO_CLIENT_ID=a\nVITE_GEOAPIFY_KEY=b\nVITE_QUOTED=c\n');
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('note: .env.local has no VITE_DEV_TOKEN (optional)');
    expect(r.stderr).not.toContain('warning');
  });
  it('only warns with --warn-only or BMPC_ALLOW_MISSING_ENV=1', () => {
    expect(run('', ['--warn-only']).status).toBe(0);
    expect(run('', [], { BMPC_ALLOW_MISSING_ENV: '1' }).status).toBe(0);
    expect(run('', ['--warn-only']).stderr).toContain('missing VITE_BLIPFOTO_CLIENT_ID');
  });
  it('treats no .env.local as everything missing', () => {
    const r = run(null);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('there is no .env.local');
  });
});
