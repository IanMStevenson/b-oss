// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { resolve } from 'node:path';
import { BaseSequencer, type TestSpecification } from 'vitest/node';
import { defineConfig } from 'vitest/config';

// The files share one shell and run in name order. (Vitest's default puts the longest and the failed
// first, which made contract-site-session.e2e.ts run after shell.e2e.ts has closed the window.)
class ByName extends BaseSequencer {
  // eslint-disable-next-line @typescript-eslint/require-await
  async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  }
}

// The end-to-end suite needs the real shell running (e2e/run.sh starts it), so it is not part of the
// normal `vitest run`, which only picks up *.test.ts.
export default defineConfig({
  resolve: {
    // The page scripts come from source, so the run needs no build of b-api-web.
    alias: [
      {
        find: /^@b-oss\/b-api-web$/,
        replacement: resolve(__dirname, '../../b-api-web/src/index.ts'),
      },
      { find: /^@b-oss\/b-api$/, replacement: resolve(__dirname, '../../b-api/src/index.ts') },
    ],
  },
  test: {
    include: ['**/*.e2e.ts'],
    root: __dirname,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    sequence: { sequencer: ByName },
  },
});
