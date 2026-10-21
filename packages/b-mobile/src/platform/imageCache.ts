// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/filesystem + file-transfer: resolve(url) -> displayable src, cached to disk
// for 15 minutes, URL-keyed, app-wide, no size cap (§10 — Directory.Cache is OS-evictable, which
// is the correct behaviour for a cache and is exactly what makes "no cap" not a disk-space
// problem). On web, resolve() returns the URL unchanged — the browser's own HTTP cache is
// adequate for local dev, and there's no native filesystem to write into anyway.
//
// Hardened for b-oss#185 (partial / corrupt images — "green jaggies" — being cached and then served
// for the whole TTL). Three rules now hold, each closing a hole the first version had:
//   1. ONE download per URL at a time. The same image is wanted by the grid, the entry page and
//      the full-screen view; concurrent callers share a single in-flight promise instead of each
//      writing the same file.
//   2. A reader NEVER sees a partial file. The download goes to `<path>.tmp`, is checked, and only
//      then renamed into place. (Before, the file's mtime was "fresh" the instant the download
//      *started*, so a second caller mid-download was handed the half-written file.)
//   3. A download is only trusted if it is a complete image (platform/imageIntegrity.ts). A bad one
//      is deleted and retried once; if it's still bad the image is shown straight from the network,
//      uncached — a failure to cache must degrade to "not cached", never to a corrupt image.
// Each rejected download is logged (`[imgcache]`, visible in logcat) so the real-world rate is
// observable.

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileTransfer } from '@capacitor/file-transfer';
import { checkImageIntegrity } from './imageIntegrity.js';

const TTL_MS = 15 * 60 * 1000;
const CACHE_DIR = 'image-cache';
/** First try + one retry after a download that arrived incomplete. */
const MAX_ATTEMPTS = 2;

/** One pending resolution per URL; concurrent callers share it. */
const inFlight = new Map<string, Promise<string>>();

async function hashUrl(url: string): Promise<string> {
  const bytes = new TextEncoder().encode(url);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

async function removeQuietly(path: string): Promise<void> {
  await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {
    // Nothing there to remove — fine.
  });
}

/** Reads the downloaded file back through the WebView and checks it is a complete image. */
async function verifyDownload(
  fileUri: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const res = await fetch(Capacitor.convertFileSrc(fileUri));
    if (!res.ok) return { ok: false, reason: `read-back failed (HTTP ${res.status})` };
    const verdict = checkImageIntegrity(new Uint8Array(await res.arrayBuffer()));
    return verdict.ok ? { ok: true } : { ok: false, reason: verdict.reason };
  } catch (err) {
    return { ok: false, reason: `read-back failed (${String(err)})` };
  }
}

/** Downloads `url` to a temp file, verifies it, and moves it to `path`. Resolves with `null` on
 * success or the reason it was rejected; rejects only if the download itself failed (network). */
async function downloadVerified(url: string, path: string): Promise<string | null> {
  const tmp = `${path}.tmp`;
  await removeQuietly(tmp); // a leftover from an interrupted earlier attempt
  const { uri: tmpUri } = await Filesystem.getUri({ path: tmp, directory: Directory.Cache });
  await FileTransfer.downloadFile({ url, path: tmpUri });

  const verdict = await verifyDownload(tmpUri);
  if (!verdict.ok) {
    await removeQuietly(tmp);
    return verdict.reason;
  }
  await removeQuietly(path); // rename won't replace an existing file on every platform
  await Filesystem.rename({ from: tmp, to: path, directory: Directory.Cache });
  return null;
}

async function resolveNative(url: string): Promise<string> {
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
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const rejected = await downloadVerified(url, path);
      if (rejected === null) {
        const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
        return Capacitor.convertFileSrc(uri);
      }
      console.warn(
        `[imgcache] rejected download (attempt ${attempt}/${MAX_ATTEMPTS}): ${rejected}`,
        {
          url: url.slice(-40),
        },
      );
    }
    // Twice incomplete: show it from the network, uncached, rather than cache a bad copy.
    return url;
  } catch {
    // The download itself failed (offline, HTTP error…) — a cache miss must never become a broken
    // image, so fall back to the remote URL unchanged.
    return url;
  }
}

/** Resolves a URL to a displayable src, downloading and caching it to disk on first use (or
 * once its cached copy is older than the 15-minute TTL). Never rejects: any failure falls back to
 * the remote URL. Concurrent calls for the same URL share one download. */
export function resolveImage(url: string): Promise<string> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(url);

  const pending = inFlight.get(url);
  if (pending) return pending;

  const request = resolveNative(url).finally(() => {
    inFlight.delete(url);
  });
  inFlight.set(url, request);
  return request;
}

/** Drops the cached copy of `url`, so the next `resolveImage` fetches it afresh — for an image
 * the WebView failed to decode despite passing the integrity check. */
export async function invalidateImage(url: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const path = `${CACHE_DIR}/${await hashUrl(url)}`;
  await removeQuietly(path);
  await removeQuietly(`${path}.tmp`);
}

// TODO: a launch/resume sweep to proactively delete expired entries (§10) isn't wired up yet —
// there's no app-lifecycle hook built until platform/appState.ts gets its real implementation.
// Not a correctness gap in the meantime: resolveImage() already checks the TTL on every call,
// and Directory.Cache is OS-evictable regardless, so stale files are a bounded, self-limiting
// cost rather than something that can grow unbounded.
