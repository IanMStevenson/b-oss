// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// b-view's own view-model types — source-agnostic, prop-driven. Previously re-exported from
// @b-oss/backup-engine; now defined here so backup data and live b-api data can be interchangeable
// sources behind the same components (see PLAN.md's Phase 0.2 for the split this came from).
// Structurally close to backup-engine's shapes (any consumer whose data has these fields works,
// including backup-engine's own, unmodified) minus fields that are backup-pipeline bookkeeping
// with no display role: schema_version, backed_up_at, backup_app_version, images.web_scraped.

export interface BlipComment {
  comment_id: string;
  parent_id: string | null;
  commenter_username: string;
  /** The commenter's avatar (URL or backup-relative path). Absent for a host that has none — the
   * backup viewer — which then renders comments without an avatar column; present-but-empty means
   * "has no avatar", shown as a neutral placeholder so the column still lines up. */
  commenter_avatar?: string;
  content: string;
  content_html: string;
  replies: BlipComment[];
}

export interface BlipEntry {
  entry_id: string;
  date: string;
  title: string;
  username: string;
  journal_title: string;

  description: string;
  description_html: string;
  tags: string[];
  location: { lat: number; lon: number } | null;

  views_total: number;
  stars_total: number;
  favorites_total: number;

  comments: BlipComment[];

  exif: {
    make: string | null;
    model: string | null;
    camera: string | null;
    exposure_time: string | null;
    f_number: string | null;
    focal_length: string | null;
    iso: string | null;
  } | null;

  images: {
    thumbnail?: string;
    image?: string;
    original?: string;
    hires?: string;
    extras?: Array<{
      item_id: string;
      thumbnail?: string;
      image?: string;
      hires?: string;
      original?: string;
    }>;
  };
}

export interface EntryIndex {
  entry_id: string;
  date: string;
  title: string;
  thumbnail_path: string;
  json_path: string;
  /** Optional: backup-engine's own equivalent shape (single-journal, so redundant per entry)
   * never carries this. Populated by b-mobile's live adapter, where it drives the
   * hidden-member-suppression grid check (rules.md) — a concept with no backup-viewer
   * counterpart, so ThumbnailGrid itself never reads it. */
  username?: string;
  /** Optional: the entry's journal title, used by ThumbnailGrid's `'journal'` caption mode. Absent
   * (or empty) falls back to `username`. */
  journal_title?: string;
}

export type EntryState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'loaded'; data: BlipEntry };
