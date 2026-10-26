// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The version b-mobile shows in Help & info. The shared build stamp (scripts/version.mjs →
// version.generated.json) is built on the root package.json version, which follows the b-ark
// release line. b-mobile releases on its own line (packages/b-mobile/package.json, which is also
// the Android versionName), so only the stamp's dev suffix (`.{commits}.{build}`) is kept.

export interface GeneratedVersion {
  version: string;
  isRelease?: boolean;
}

export function appVersion(base: string, generated: GeneratedVersion | null): string {
  if (!generated) return `${base}-dev`;
  if (generated.isRelease) return base;
  const suffix = generated.version.split('.').slice(3);
  return suffix.length ? `${base}.${suffix.join('.')}` : base;
}
