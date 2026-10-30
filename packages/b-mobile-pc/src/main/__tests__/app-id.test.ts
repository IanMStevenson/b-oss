// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_USER_MODEL_ID } from '../app-id.js';

describe('APP_USER_MODEL_ID', () => {
  it('equals the appId the installer registers its Start Menu shortcut with', () => {
    const builder = JSON.parse(
      readFileSync(join(__dirname, '../../../electron-builder.json'), 'utf8'),
    ) as { appId: string };
    expect(APP_USER_MODEL_ID).toBe(builder.appId);
  });
});
