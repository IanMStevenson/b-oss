// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

export interface LogEntry {
  id: string;
  backup_id?: string;
  account_id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface BlipComment {
  comment_id: string;
  parent_id: string | null;
  commenter_username: string;
  commenter_avatar_url: string;
  content: string;
  content_html: string;
  replies: BlipComment[];
}

export interface BlipEntry {
  schema_version: 1;

  entry_id: string;
  date: string;
  date_stamp: number;
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
  };

  backed_up_at: string;
  backup_app_version: string;
}

export interface EntryIndex {
  entry_id: string;
  date: string;
  title: string;
  thumbnail_path: string;
  json_path: string;
}

export interface JournalMetadata {
  schema_version: 1;
  username: string;
  journal_title: string;
  avatar_url: string;
  entry_total: number;
  last_backup_at: string;
  entries: EntryIndex[];
}

export interface BackupCheckpoint {
  started_at: string;
  last_page_index: number;
  fetched_entry_ids: string[];
  total_to_fetch: number;
}

export type BackupErrorPayload =
  | { kind: 'auth_expired' }
  | { kind: 'network' }
  | { kind: 'api_error'; code: number; message: string }
  | { kind: 'filesystem'; message: string };

export type BackupPhase = 'redo' | 'gap_fill' | 'new_posts' | 'image_repair';

export type BackupEvent =
  | {
      type: 'started';
      account_id: string;
      total_to_fetch: number;
      kind: 'first' | 'routine';
    }
  | {
      type: 'progress';
      account_id: string;
      done: number;
      total: number;
      current_date: string;
      total_archived: number;
      phase?: BackupPhase;
    }
  | { type: 'rate_limited'; account_id: string; resume_in_seconds: number }
  | { type: 'completed'; account_id: string; total_archived: number }
  | { type: 'failed'; account_id: string; error: BackupErrorPayload };

export interface AccountBackupConfig {
  id: string;
  username: string;
  journal_title: string;
  avatar_url: string;
  access_token: string;
  backup_folder: string;
  redo_count: number;
  gap_check_days: number;
  api_delay_ms: number;
  app_version: string;
}
