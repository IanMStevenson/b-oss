// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { defineConfig } from 'vitest/config';

// The end-to-end suite needs the real shell running (e2e/run.sh starts it), so it is not part of the
// normal `vitest run`, which only picks up *.test.ts.
export default defineConfig({
  test: {
    include: ['**/*.e2e.ts'],
    root: __dirname,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
