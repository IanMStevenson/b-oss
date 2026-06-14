// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

export { BrowserBackend } from './BrowserBackend.js';
export { BackupPage } from './BackupPage.js';
export { mountChip } from './chip.js';

// Chrome platform primitives — shared with b-ark-chrome app entry points
export { BrowserPlatformIO } from './browser-platform-io.js';
export { deployViewer } from './deploy-viewer.js';
export { loadToken, storeToken, clearToken } from './token-storage.js';
export type { StoredToken } from './token-storage.js';
export {
  loadHandle,
  saveHandle,
  clearHandle,
  queryFsaPermission,
  requestFsaPermission,
} from './fsa-persistence.js';
