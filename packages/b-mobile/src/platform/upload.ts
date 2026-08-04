// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/file-transfer for b-api's multipart seam (§7, §9). Hand-builds a
// multipart/form-data body to a temp file and uploads it with an explicit Content-Type header —
// see app-architecture.md §7 for why (CapacitorHttp mishandles FormData/Blob; the plugin's own
// params-based multipart merging silently drops fields on iOS). This is what makes native
// publish/edit/avatar-upload possible at all.
// TODO(Phase 7): implement against @capacitor/file-transfer.

import { Capacitor } from '@capacitor/core';
import type { MultipartImpl } from '@b-oss/b-api';

/** Returns the native multipart transport when running on-device, undefined on web (falls back
 * to b-api's default FormData/Blob path, which only ever sees blob-sourced files there anyway). */
export function getMultipartImpl(): MultipartImpl | undefined {
  if (!Capacitor.isNativePlatform()) return undefined;
  return () => {
    throw new Error('platform/upload.ts: native multipart upload not implemented until Phase 7');
  };
}
