// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

/// <reference types="node" />

// docs/PLATFORM-MATRIX.md is generated; this fails when it is stale so that any change to what
// differs between platforms is visible in the PR's diff. Regenerate with
// `UPDATE_PLATFORM_MATRIX=1 npx vitest run src/profile` (b-oss#634).

import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderPlatformMatrix } from '../matrix.js';

const FILE = fileURLToPath(new URL('../../../docs/PLATFORM-MATRIX.md', import.meta.url));

describe('platform matrix', () => {
  it('docs/PLATFORM-MATRIX.md is up to date', () => {
    const rendered = renderPlatformMatrix();
    if (process.env.UPDATE_PLATFORM_MATRIX) writeFileSync(FILE, rendered);
    // Normalise line endings: a Windows checkout may have CRLF.
    expect(readFileSync(FILE, 'utf8').replace(/\r\n/g, '\n')).toBe(rendered);
  });
});
