// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/file-transfer for b-api's multipart seam (§7, §9). Hand-builds a
// multipart/form-data body to a temp file and uploads it with an explicit Content-Type header —
// see app-architecture.md §7 for why (CapacitorHttp mishandles FormData/Blob; the plugin's own
// params-based multipart merging silently drops fields on iOS). This is what makes native
// publish/edit/avatar-upload possible at all.
//
// Also turns a picked photo into the FileSource the publish/edit call sends (photoToFileSource),
// and clears the old upload queue's leftovers (discardLegacyUploadQueue). @capacitor/filesystem
// ships a genuine web implementation, so the same code runs under `vite dev`.

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileTransfer } from '@capacitor/file-transfer';
import type { FileTransferError } from '@capacitor/file-transfer';
import type { MultipartImpl, FileSource } from '@b-oss/b-api';
import { buildMultipartBody } from '../data/multipartBody.js';
import { base64ToBytes, bytesToBase64 } from '../data/binary.js';
import { randomId } from '../data/id.js';
import { deletePref } from './prefs.js';
import type { PickedPhoto } from './camera.js';

const UPLOADS_DIR = 'uploads';
const LEGACY_QUEUE_PREF = 'b-mobile:upload-queue';

/** The FileSource `publishEntry`/`updateEntry` need for a picked photo, read straight from the
 * picker's own location (the upload now happens while the app is open, so the picker's temporary
 * grant is still good). Native gets a path reference, read by getMultipartImpl() below and never
 * loaded into JS memory here; web gets an in-memory Blob, the only form b-api's default FormData
 * path can send. */
export async function photoToFileSource(photo: PickedPhoto): Promise<FileSource> {
  if (Capacitor.isNativePlatform() && photo.uri) {
    return { path: photo.uri, mimeType: photo.mimeType };
  }
  const blob = await (await fetch(photo.webPath)).blob();
  return { blob: new Blob([blob], { type: photo.mimeType }) };
}

/** One-off clean-up of the retired durable upload queue (b-oss#730): its saved list and the photos
 * it copied into app storage are dropped without being sent. Safe to run on every launch. */
export async function discardLegacyUploadQueue(): Promise<void> {
  await deletePref(LEGACY_QUEUE_PREF).catch(() => {});
  await Filesystem.rmdir({ path: UPLOADS_DIR, directory: Directory.Data, recursive: true }).catch(
    () => {
      // No such directory — nothing was ever queued.
    },
  );
}

/** The bytes of a multipart file part from either FileSource form. A path is read from the
 * filesystem; a Blob (the avatar, which is cropped to a Blob in JS) is read directly — rejecting
 * it here was what made every native avatar upload fail with the generic message (b-oss#318). */
export async function resolveFilePart(
  file: { fieldName: string; filename: string; source: FileSource },
  readPath: (path: string) => Promise<string> = async (path) =>
    (await Filesystem.readFile({ path })).data as string,
): Promise<{ fieldName: string; filename: string; contentType: string; bytes: Uint8Array }> {
  if ('blob' in file.source) {
    return {
      fieldName: file.fieldName,
      filename: file.filename,
      contentType: file.source.blob.type || 'image/jpeg',
      bytes: new Uint8Array(await file.source.blob.arrayBuffer()),
    };
  }
  return {
    fieldName: file.fieldName,
    filename: file.filename,
    contentType: file.source.mimeType,
    bytes: base64ToBytes(await readPath(file.source.path)),
  };
}

/** Returns the native multipart transport when running on-device, undefined on web (falls back
 * to b-api's default FormData/Blob path, which only ever sees blob-sourced files there anyway). */
export function getMultipartImpl(): MultipartImpl | undefined {
  if (!Capacitor.isNativePlatform()) return undefined;

  return async ({ url, method, headers, fields, file }) => {
    const filePart = file ? await resolveFilePart(file) : undefined;

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
