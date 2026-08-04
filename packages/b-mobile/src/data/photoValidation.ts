// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-10's "unsupported type or too small" check (SCR-09: "validation detail is enforced on
// SCR-10"), and SCR-25's avatar picker (ProfileSection.tsx) reusing the same function with its
// own, smaller limits — Blipfoto enforces these per upload purpose, not per account tier. Pure
// logic — no Capacitor/platform dependency, directly testable.
//
// Real limits confirmed by the user 2026-08-05, read from Blipfoto's own server source (not
// stated anywhere in AppSpec/ImplementationSpec, which is why TODO G left this as a placeholder
// through Phase 11 — see RESUME.md):
// - Entry photos: minimum 600px on *at least one* edge (Image.php SIZE_LORES_MIN_EDGE), no
//   maximum (oversized originals are stored as-is and only derived renditions are downscaled),
//   1 KB–20 MB file size (S3 upload policy content-length-range).
// - Avatar photos: minimum 300px on at least one edge, 3 MB max file size, hard-coded
//   (AvatarUploader.php) — no minimum file size documented for this path, so none is enforced.
// "At least one edge", not both — a thin panorama or a tall crop is valid as long as one
// dimension clears the floor; this replaced an earlier stricter (both-edges) placeholder check.

export const SUPPORTED_MIME_TYPES = ['image/jpeg', 'image/png'] as const;

export type PhotoUploadPurpose = 'entry' | 'avatar';

interface PhotoLimits {
  minEdge: number;
  maxFileSizeBytes: number;
  minFileSizeBytes: number | null;
}

const LIMITS: Record<PhotoUploadPurpose, PhotoLimits> = {
  entry: { minEdge: 600, maxFileSizeBytes: 20 * 1024 * 1024, minFileSizeBytes: 1024 },
  avatar: { minEdge: 300, maxFileSizeBytes: 3 * 1024 * 1024, minFileSizeBytes: null },
};

export type PhotoValidationResult = { ok: true } | { ok: false; message: string };

export function validatePickedPhoto(
  photo: {
    mimeType: string;
    width: number | null;
    height: number | null;
    sizeBytes?: number | null;
  },
  purpose: PhotoUploadPurpose = 'entry',
): PhotoValidationResult {
  if (!SUPPORTED_MIME_TYPES.includes(photo.mimeType as (typeof SUPPORTED_MIME_TYPES)[number])) {
    return { ok: false, message: 'That file type isn’t supported. Choose a JPEG or PNG photo.' };
  }

  const limits = LIMITS[purpose];

  if (
    photo.width != null &&
    photo.height != null &&
    photo.width < limits.minEdge &&
    photo.height < limits.minEdge
  ) {
    return { ok: false, message: 'That photo is too small to use.' };
  }

  const sizeBytes = photo.sizeBytes ?? null;
  if (sizeBytes != null) {
    if (sizeBytes > limits.maxFileSizeBytes) {
      return { ok: false, message: 'That photo’s file is too large to upload.' };
    }
    if (limits.minFileSizeBytes != null && sizeBytes < limits.minFileSizeBytes) {
      return { ok: false, message: 'That photo can’t be used.' };
    }
  }

  return { ok: true };
}
