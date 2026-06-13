// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import fs from 'node:fs/promises';
import path from 'node:path';
import { renameWithRetry } from './platform-io.js';
import type { BArkSettings } from '@b-oss/b-ark-ui-electron';
import { B_ARK_SETTINGS_SCHEMA_VERSION } from './schema-version.js';
import { computeNextRun } from './scheduler.js';

const SETTINGS_FILENAME = 'b-ark-settings.json';
const SETTINGS_TMP_FILENAME = 'b-ark-settings.tmp';

export class PortableSettingsManager {
  private readonly filePath: string;
  private readonly tmpPath: string;

  constructor(folder: string) {
    this.filePath = path.join(folder, SETTINGS_FILENAME);
    this.tmpPath = path.join(folder, SETTINGS_TMP_FILENAME);
  }

  async fileExists(): Promise<boolean> {
    try {
      await fs.access(this.filePath);
      return true;
    } catch {
      return false;
    }
  }

  async load(): Promise<BArkSettings> {
    const buf = await fs.readFile(this.filePath);
    const raw = JSON.parse(buf.toString()) as unknown;
    return PortableSettingsManager.validate(raw);
  }

  async save(settings: BArkSettings): Promise<void> {
    const serialised = JSON.stringify(settings, null, 2);
    await fs.writeFile(this.tmpPath, serialised);
    await renameWithRetry(this.tmpPath, this.filePath);
  }

  static defaults(): BArkSettings {
    return {
      schema_version: B_ARK_SETTINGS_SCHEMA_VERSION,
      accounts: [],
      account_order: [],
      schedule: {
        enabled: true,
        next_run: computeNextRun(2, 'daily'),
        hour: 2,
        interval: 'daily',
      },
      api_delay_ms: 250,
      gap_check_days: 31,
      redo_count: 7,
      ui: { thumbnail_size_percent: 100, show_info_overlay: true },
    };
  }

  static validate(raw: unknown): BArkSettings {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error('b-ark-settings.json: not an object');
    }
    const r = raw as Record<string, unknown>;
    const v = r['schema_version'];
    if (typeof v !== 'number' || !Number.isInteger(v)) {
      throw new Error('b-ark-settings.json: missing or invalid schema_version');
    }
    if (v > B_ARK_SETTINGS_SCHEMA_VERSION) {
      throw new Error(
        `b-ark-settings.json was written by a newer version of b-ark (schema ${v}). Please update b-ark before continuing.`,
      );
    }
    if (v < B_ARK_SETTINGS_SCHEMA_VERSION) {
      throw new Error(
        `b-ark-settings.json was written by an older version of b-ark (schema ${v}). This version expects schema ${B_ARK_SETTINGS_SCHEMA_VERSION}.`,
      );
    }
    if (!Array.isArray(r['accounts'])) {
      throw new Error('b-ark-settings.json: missing accounts array');
    }
    if (!Array.isArray(r['account_order'])) {
      throw new Error('b-ark-settings.json: missing account_order array');
    }
    if (typeof r['schedule'] !== 'object' || r['schedule'] === null) {
      throw new Error('b-ark-settings.json: missing schedule object');
    }
    const validated = r as unknown as BArkSettings;
    // Normalise ui fields added after the initial schema v1 release.
    if (typeof validated.ui?.show_info_overlay !== 'boolean') {
      validated.ui = { ...validated.ui, show_info_overlay: true };
    }
    return validated;
  }
}
