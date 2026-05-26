// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { store, adoptPortable, clearLegacyKeys, setAllStatus, setAllTokens } from './store.js';
import { PortableSettingsManager } from './portable-settings.js';
import { migrateV1Shape, type LegacyV1Shape } from './migrate-store-pure.js';

/**
 * One-shot migration from v1 electron-store schema (per-account settings) to
 * v2 (split portable + local). Idempotent — detects v1 by the presence of the
 * legacy `accounts` array and skips if absent. Old per-journal `_log.ndjson`
 * files are intentionally left in place; the new unified log starts fresh.
 */
export async function migrateFromV1IfNeeded(): Promise<void> {
  const raw = store.store as unknown as LegacyV1Shape & Record<string, unknown>;
  if (!Array.isArray(raw.accounts)) return;

  const result = migrateV1Shape(raw);

  // Write v2 local store first, so a crash mid-migration leaves a coherent
  // local store (the portable file is the secondary artefact).
  store.set('backup_folder', result.canonicalFolder);
  store.set('app', { startWithWindows: result.startWithWindows, autoUpdateEnabled: true });
  setAllTokens(result.tokens);
  setAllStatus(result.status);
  store.set('schema_version', 2);
  clearLegacyKeys();

  // Write the portable file iff we have a folder to put it in.
  if (result.canonicalFolder) {
    const mgr = new PortableSettingsManager(result.canonicalFolder);
    await mgr.save(result.portableSettings);
    adoptPortable(result.canonicalFolder, result.portableSettings);
  } else {
    // No folder yet — seed the in-memory cache so subsequent account ops work
    // before the user picks one. The cache flushes on bindBackupFolder().
    adoptPortable('', result.portableSettings);
  }
}
