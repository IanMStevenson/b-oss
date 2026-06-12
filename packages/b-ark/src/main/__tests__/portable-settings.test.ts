// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { BArkSettings } from '@b-oss/b-ark-ui-electron';
import { B_ARK_SETTINGS_SCHEMA_VERSION } from '../schema-version.js';
import { PortableSettingsManager } from '../portable-settings.js';

describe('PortableSettingsManager', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'b-ark-portable-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('reports fileExists=false on an empty folder', async () => {
    const mgr = new PortableSettingsManager(tmpDir);
    expect(await mgr.fileExists()).toBe(false);
  });

  it('round-trips a settings object via save → load', async () => {
    const mgr = new PortableSettingsManager(tmpDir);
    const settings: BArkSettings = {
      schema_version: B_ARK_SETTINGS_SCHEMA_VERSION,
      accounts: [
        { id: 'a1', username: 'alice', journal_title: 'Alice', avatar_url: 'https://x/a.jpg' },
        { id: 'b2', username: 'bob', journal_title: 'Bob', avatar_url: 'https://x/b.jpg' },
      ],
      account_order: ['a1', 'b2'],
      schedule: { enabled: true, next_run: '2026-06-01T02:00:00.000Z', hour: 2, interval: 'daily' },
      api_delay_ms: 250,
      gap_check_days: 14,
      redo_count: 5,
      ui: { thumbnail_size_percent: 120, show_info_overlay: true },
    };
    await mgr.save(settings);
    expect(await mgr.fileExists()).toBe(true);
    const loaded = await mgr.load();
    expect(loaded).toEqual(settings);
  });

  it('writes atomically via .tmp + rename — no .tmp file remains after save', async () => {
    const mgr = new PortableSettingsManager(tmpDir);
    await mgr.save(PortableSettingsManager.defaults());
    const files = await fs.readdir(tmpDir);
    expect(files).toContain('b-ark-settings.json');
    expect(files).not.toContain('b-ark-settings.tmp');
  });

  it('defaults() returns a schema-compatible object', () => {
    const d = PortableSettingsManager.defaults();
    expect(d.schema_version).toBe(B_ARK_SETTINGS_SCHEMA_VERSION);
    expect(d.accounts).toEqual([]);
    expect(d.account_order).toEqual([]);
    expect(d.schedule.enabled).toBe(true);
    expect(d.schedule.hour).toBe(2);
    expect(d.schedule.interval).toBe('daily');
  });

  it('validate() throws on missing schema_version', () => {
    expect(() => PortableSettingsManager.validate({ accounts: [] })).toThrow(/schema_version/);
  });

  it('validate() throws on newer schema_version (forward-incompatible)', () => {
    const raw = { ...PortableSettingsManager.defaults(), schema_version: 99 };
    expect(() => PortableSettingsManager.validate(raw)).toThrow(/newer version/);
  });

  it('validate() throws on older schema_version', () => {
    const raw = { ...PortableSettingsManager.defaults(), schema_version: 0 };
    expect(() => PortableSettingsManager.validate(raw)).toThrow(/older version/);
  });

  it('load() throws on an existing file with incompatible schema, leaving the file in place', async () => {
    const filePath = path.join(tmpDir, 'b-ark-settings.json');
    await fs.writeFile(
      filePath,
      JSON.stringify({ ...PortableSettingsManager.defaults(), schema_version: 99 }),
    );
    const mgr = new PortableSettingsManager(tmpDir);
    await expect(mgr.load()).rejects.toThrow(/newer version/);
    // File untouched
    const after = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(after) as { schema_version: number };
    expect(parsed.schema_version).toBe(99);
  });
});
