// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/filesystem + file-transfer: resolve(url) -> displayable src, cached to disk
// for 15 minutes, URL-keyed, app-wide (§10). On web, resolve() returns the URL unchanged — no
// cache layer needed since the browser's own HTTP cache is adequate for local dev.
// TODO(Phase 3): implement the native disk cache with TTL-on-mtime + launch/resume sweep.

import { Capacitor } from '@capacitor/core';

export function resolveImage(url: string): Promise<string> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(url);
  return Promise.reject(
    new Error('platform/imageCache.ts: native image cache not implemented until Phase 3'),
  );
}
