// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/file-transfer for b-api's multipart seam (§7, §9). Hand-builds a
// multipart/form-data body to a temp file and uploads it with an explicit Content-Type header —
// see app-architecture.md §7 for why (CapacitorHttp mishandles FormData/Blob; the plugin's own
// params-based multipart merging silently drops fields on iOS). This is what makes native
// publish/edit/avatar-upload possible at all.
//
// Also owns the upload queue's file lifecycle (§9's "the photo is copied into app-private
// storage on enqueue" — a picker/camera URI is a temporary grant that can expire or be revoked
// before the queue actually runs): copyPhotoToAppStorage / readQueuedFileAsSource /
// deleteQueuedFile. @capacitor/filesystem ships a genuine web implementation (IndexedDB-backed),
// so this same code path works under `vite dev` too — no isNativePlatform() branch needed for the
// copy/delete steps themselves, only for *how* a FileSource is produced for mutateMultipart
// (native: a path reference; web: an in-memory Blob, since b-api's default FormData path can't
// read a native filesystem path — see types.ts's FileSource union).

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileTransfer } from '@capacitor/file-transfer';
import type { FileTransferError } from '@capacitor/file-transfer';
import type { MultipartImpl, FileSource } from '@b-oss/b-api';
import { buildMultipartBody } from '../data/multipartBody.js';
import { base64ToBytes, bytesToBase64 } from '../data/binary.js';
import { randomId } from '../data/id.js';
import type { PickedPhoto } from './camera.js';

const UPLOADS_DIR = 'uploads';

async function ensureUploadsDir(): Promise<void> {
  await Filesystem.mkdir({ path: UPLOADS_DIR, directory: Directory.Data, recursive: true }).catch(
    () => {
      // Already exists — mkdir on an existing directory rejects, which is fine to ignore.
    },
  );
}

function extensionFor(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/gif') return 'gif';
  return 'jpg';
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string; // "data:<mime>;base64,XXXX"
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the picked photo.'));
    reader.readAsDataURL(blob);
  });
}

/** §9's enqueue-time copy. Returns the path (relative to Directory.Data) to persist on the queue
 * item — never the picker's own URI, which is not guaranteed to survive past this call. */
export async function copyPhotoToAppStorage(photo: PickedPhoto, itemId: string): Promise<string> {
  await ensureUploadsDir();
  const destPath = `${UPLOADS_DIR}/${itemId}.${extensionFor(photo.mimeType)}`;

  if (Capacitor.isNativePlatform() && photo.uri) {
    try {
      await Filesystem.copy({ from: photo.uri, to: destPath, toDirectory: Directory.Data });
      return destPath;
    } catch {
      // Some pickers (Android content:// URIs in particular) can't be copied directly by path —
      // fall back to a read+write round trip, which goes through the same ContentResolver-backed
      // read the plugin itself would use. Best-effort: unverified without a device (no spike for
      // this specific fallback path, unlike §7/§8's source-read-verified multipart/OAuth seams).
      const { data } = await Filesystem.readFile({ path: photo.uri });
      await Filesystem.writeFile({ path: destPath, directory: Directory.Data, data });
      return destPath;
    }
  }

  // Web (dev): webPath is a blob: URL — fetch it directly and write the bytes as base64.
  const blob = await (await fetch(photo.webPath)).blob();
  const base64 = await blobToBase64(blob);
  await Filesystem.writeFile({ path: destPath, directory: Directory.Data, data: base64 });
  return destPath;
}

/** Produces the FileSource `publishEntry`/`updateEntry` need for a queue item's copied photo.
 * Native gets a path reference (read by getMultipartImpl() below, never loaded into JS memory
 * here); web gets an in-memory Blob, since that's the only form the default FormData path (b-api,
 * no multipartImpl configured on web) can send. */
export async function readQueuedFileAsSource(
  relativePath: string,
  mimeType: string,
): Promise<FileSource> {
  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.getUri({ path: relativePath, directory: Directory.Data });
    return { path: uri, mimeType };
  }
  const { data } = await Filesystem.readFile({ path: relativePath, directory: Directory.Data });
  // Re-wrapped via the ArrayLike constructor overload (Uint8Array<ArrayBuffer>) rather than
  // passing base64ToBytes()'s own return value straight through (Uint8Array<ArrayBufferLike>,
  // which BlobPart's stricter DOM lib type doesn't accept) — same bytes, a TS-only distinction.
  return { blob: new Blob([new Uint8Array(base64ToBytes(data as string))], { type: mimeType }) };
}

/** A displayable <img src> for a queued file (SCR-14's thumbnail), re-derived on demand rather
 * than persisted — a web blob: URL wouldn't survive a page reload anyway, and the underlying
 * file itself (not a URL to it) is what's actually durable. Native only: on web there's no
 * `Capacitor.convertFileSrc`-equivalent for the Filesystem web implementation's own storage, so
 * SCR-14 simply shows no thumbnail image in desktop-browser dev — title/status/tap-through still
 * work, which is the part that's actually required (SCR-14's acceptance criteria never mandate a
 * pixel-perfect thumbnail, only status and a way to open the finished entry). */
export async function resolveQueuedFileDisplaySrc(relativePath: string): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { uri } = await Filesystem.getUri({ path: relativePath, directory: Directory.Data });
    return Capacitor.convertFileSrc(uri);
  } catch {
    return null;
  }
}

export async function deleteQueuedFile(relativePath: string): Promise<void> {
  await Filesystem.deleteFile({ path: relativePath, directory: Directory.Data }).catch(() => {
    // Already gone, or never existed (an edit-details-only item has no file) — fine either way.
  });
}

/** Returns the native multipart transport when running on-device, undefined on web (falls back
 * to b-api's default FormData/Blob path, which only ever sees blob-sourced files there anyway). */
export function getMultipartImpl(): MultipartImpl | undefined {
  if (!Capacitor.isNativePlatform()) return undefined;

  return async ({ url, method, headers, fields, file }) => {
    let filePart:
      { fieldName: string; filename: string; contentType: string; bytes: Uint8Array } | undefined;
    if (file) {
      if (!('path' in file.source)) {
        throw new Error(
          'platform/upload.ts: native multipart received a Blob-sourced file — expected a path (see app-architecture.md §7).',
        );
      }
      const { data } = await Filesystem.readFile({ path: file.source.path });
      filePart = {
        fieldName: file.fieldName,
        filename: file.filename,
        contentType: file.source.mimeType,
        bytes: base64ToBytes(data as string),
      };
    }

    const boundary = `b-mobile-${randomId(8)}`;
    const body = buildMultipartBody(fields, filePart, boundary);
    const bodyPath = `upload-body-${randomId(8)}.tmp`;
    await Filesystem.writeFile({
      path: bodyPath,
      directory: Directory.Cache,
      data: bytesToBase64(body),
    });
    const { uri: bodyUri } = await Filesystem.getUri({
      path: bodyPath,
      directory: Directory.Cache,
    });

    try {
      const result = await FileTransfer.uploadFile({
        url,
        path: bodyUri,
        method,
        headers: { ...headers, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      });
      return {
        status: Number(result.responseCode),
        headers: result.headers,
        body: result.response ?? '',
      };
    } catch (err) {
      // FileTransfer.uploadFile REJECTS on an HTTP error status (unlike fetch, which resolves
      // and lets the caller inspect response.ok) — but a 4xx/5xx from Blipfoto's API still
      // carries a parseable error envelope that BlipfotoClient.mutateMultipart needs to see via
      // its own parseEnvelopeBody, exactly like the default fetch path does for a non-2xx
      // response. Treating every rejection as a NetworkError would misclassify every write/
      // validation/forced-logout error as a transport failure and defeat data/errors.ts's entire
      // outcome mapping for every multipart call. So: if the rejection carries an httpStatus and
      // a body (the server was reached and responded), return it as a normal result instead of
      // rethrowing; only a genuine transport failure (no httpStatus/body at all) propagates.
      const transferError = err as Partial<FileTransferError> | undefined;
      if (
        transferError &&
        typeof transferError.httpStatus === 'number' &&
        typeof transferError.body === 'string'
      ) {
        return {
          status: transferError.httpStatus,
          headers: transferError.headers,
          body: transferError.body,
        };
      }
      throw err;
    } finally {
      await Filesystem.deleteFile({ path: bodyPath, directory: Directory.Cache }).catch(() => {});
    }
  };
}
