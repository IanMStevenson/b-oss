// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/filesystem + file-transfer: resolve(url) -> displayable src, cached to disk
// for 15 minutes, URL-keyed, app-wide, no size cap (§10 — Directory.Cache is OS-evictable, which
// is the correct behaviour for a cache and is exactly what makes "no cap" not a disk-space
// problem). On web, resolve() returns the URL unchanged — the browser's own HTTP cache is
// adequate for local dev, and there's no native filesystem to write into anyway.

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileTransfer } from '@capacitor/file-transfer';

const TTL_MS = 15 * 60 * 1000;
const CACHE_DIR = 'image-cache';

async function hashUrl(url: string): Promise<string> {
  const bytes = new TextEncoder().encode(url);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

/** Resolves a URL to a displayable src, downloading and caching it to disk on first use (or
 * once its cached copy is older than the 15-minute TTL). A cache miss/failure must never become
 * a broken image, so any error falls back to the remote URL unchanged. */
export async function resolveImage(url: string): Promise<string> {
  if (!Capacitor.isNativePlatform()) return url;

  const path = `${CACHE_DIR}/${await hashUrl(url)}`;

  try {
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
    const stat = await Filesystem.stat({ path, directory: Directory.Cache });
    const ageMs = Date.now() - (stat.mtime ?? 0);
    if (ageMs < TTL_MS) {
      return Capacitor.convertFileSrc(uri);
    }
  } catch {
    // Not cached yet, or stat failed — fall through to (re)download below.
  }

  try {
    await Filesystem.mkdir({ path: CACHE_DIR, directory: Directory.Cache, recursive: true }).catch(
      () => {
        // Already exists — mkdir on an existing directory rejects, which is fine to ignore.
      },
    );
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
    await FileTransfer.downloadFile({ url, path: uri });
    return Capacitor.convertFileSrc(uri);
  } catch {
    return url;
  }
}

// TODO: a launch/resume sweep to proactively delete expired entries (§10) isn't wired up yet —
// there's no app-lifecycle hook built until platform/appState.ts gets its real implementation.
// Not a correctness gap in the meantime: resolveImage() already checks the TTL on every call,
// and Directory.Cache is OS-evictable regardless, so stale files are a bounded, self-limiting
// cost rather than something that can grow unbounded.
