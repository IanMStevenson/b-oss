// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Hand-builds a complete multipart/form-data body as raw bytes (app-architecture.md §7 — write
// all fields, then the file, to a temp file, then upload it with an explicit Content-Type header
// so @capacitor/file-transfer's plugin skips its own field-dropping-on-iOS multipart handling).
// Pure logic, no Capacitor dependency, so it's directly unit-testable rather than only exercised
// through a mocked native call — the same "one platform-adjacent module gets a direct test" shape
// as platform/mapTiles.ts.

export interface MultipartFilePart {
  fieldName: string;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}

const CRLF = '\r\n';

/** Builds the exact bytes of a multipart/form-data body: one part per field (in insertion
 * order), then the file part (if any), then the closing boundary. */
export function buildMultipartBody(
  fields: Record<string, string>,
  file: MultipartFilePart | undefined,
  boundary: string,
): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];

  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      encoder.encode(
        `--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`,
      ),
    );
  }

  if (file) {
    chunks.push(
      encoder.encode(
        `--${boundary}${CRLF}` +
          `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"${CRLF}` +
          `Content-Type: ${file.contentType}${CRLF}${CRLF}`,
      ),
    );
    chunks.push(file.bytes);
    chunks.push(encoder.encode(CRLF));
  }

  chunks.push(encoder.encode(`--${boundary}--${CRLF}`));

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}
