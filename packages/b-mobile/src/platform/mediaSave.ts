// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Saves an image into the phone's gallery (Pictures/b-mobile) via the local MediaSavePlugin
// (android/app/.../MediaSavePlugin.java). It downloads the image itself rather than reusing the
// image cache: the cache hands back a WebView-displayable URL (or, after a failed cache, the
// remote URL), neither of which is a file the native side can copy, and a cached copy may be up to
// its TTL old. A fresh, integrity-checked download to a temp file is the reliable source.
// Off native there is no gallery: the browser just opens the image URL (desktop dev).

import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileTransfer } from '@capacitor/file-transfer';
import { checkImageIntegrity } from './imageIntegrity.js';

interface MediaSavePlugin {
  saveImage(options: { uri: string; fileName: string }): Promise<{ location: string }>;
}

const MediaSave = registerPlugin<MediaSavePlugin>('MediaSave');

const TEMP_DIR = 'downloads';

/** Downloads `url` to a temp file and returns its file:// URI, after checking it is a complete image. */
async function downloadToTemp(
  url: string,
  tempName: string,
): Promise<{ uri: string; path: string }> {
  await Filesystem.mkdir({ path: TEMP_DIR, directory: Directory.Cache, recursive: true }).catch(
    () => {
      // Already exists — fine.
    },
  );
  const path = `${TEMP_DIR}/${tempName}`;
  await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {
    // Nothing left over from an earlier attempt.
  });
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
  await FileTransfer.downloadFile({ url, path: uri });

  const res = await fetch(Capacitor.convertFileSrc(uri));
  const verdict = checkImageIntegrity(new Uint8Array(await res.arrayBuffer()));
  if (!verdict.ok) {
    await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});
    throw new Error(`The download was incomplete (${verdict.reason}). Please try again.`);
  }
  return { uri, path };
}

/** Downloads the image at `url` and saves it to the gallery as `fileName` (extension added from the
 * real image type). Returns where it was saved, or `null` when it was merely opened (web). */
export async function saveRemoteImageToGallery(
  url: string,
  fileName: string,
): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) {
    window.open(url, '_blank', 'noopener');
    return null;
  }
  const temp = await downloadToTemp(url, fileName);
  try {
    const { location } = await MediaSave.saveImage({ uri: temp.uri, fileName });
    return location;
  } finally {
    await Filesystem.deleteFile({ path: temp.path, directory: Directory.Cache }).catch(() => {});
  }
}
