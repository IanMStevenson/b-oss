// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-10's "unsupported type or too small" check (SCR-09: "validation detail is enforced on
// SCR-10"). Pure logic — no Capacitor/platform dependency, directly testable.
//
// The exact minimum dimensions are TODO G's output (app-architecture.md §15: "the exact limits
// come from TODO G") — not decided anywhere in AppSpec/ImplementationSpec yet. Rather than block
// this phase on an undecided number, MIN_DIMENSION is a conservative, clearly-marked placeholder;
// an implementer landing TODO G's real answer only has to change the one constant below.

export const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png'] as const;

/** TODO(TODO G): placeholder floor — the spec doesn't define a real minimum yet. */
export const MIN_DIMENSION = 200;

export type PhotoValidationResult = { ok: true } | { ok: false; message: string };

export function validatePickedPhoto(photo: {
  mimeType: string;
  width: number | null;
  height: number | null;
}): PhotoValidationResult {
  if (!SUPPORTED_MIME_TYPES.includes(photo.mimeType as (typeof SUPPORTED_MIME_TYPES)[number])) {
    return { ok: false, message: 'That file type isn’t supported. Choose a JPEG or PNG photo.' };
  }
  if (
    photo.width != null &&
    photo.height != null &&
    (photo.width < MIN_DIMENSION || photo.height < MIN_DIMENSION)
  ) {
    return { ok: false, message: 'That photo is too small to use.' };
  }
  return { ok: true };
}
