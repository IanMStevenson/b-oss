// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The live adapter — maps b-api responses into b-view's view-model types (app-architecture.md
// §2). Lives here, not in a package: there's exactly one consumer, and promoting it to a
// b-view-live package is a single move if a second ever appears.
//
// `EntryIndex.json_path` is repurposed as the entry id — b-view's ThumbnailGrid treats it as an
// opaque key round-tripped through `resolveEntry`, which here calls the live API instead of
// reading a backup file. Likewise `thumbnail_path`/`images.*` are full URLs, not backup-relative
// paths — b-view's `resolveAsset` routes them through platform/imageCache.ts (§10) instead of
// the backup viewer's blob-URL resolution.

import type { BlipEntryStub, EntryResponse, BlipComment as ApiComment } from '@b-oss/b-api';
import type { EntryIndex, BlipEntry, BlipComment } from '@b-oss/b-view';

export function stubToEntryIndex(stub: BlipEntryStub): EntryIndex {
  return {
    entry_id: stub.entry_id_str,
    date: stub.date,
    title: stub.title,
    thumbnail_path: stub.thumbnail_url,
    json_path: stub.entry_id_str,
    username: stub.username,
  };
}

function toViewComment(comment: ApiComment): BlipComment {
  return {
    comment_id: comment.comment_id_str,
    parent_id: comment.parent_id_str,
    commenter_username: comment.commenter.username,
    content: comment.content,
    content_html: comment.content_html,
    replies: (comment.replies ?? []).map(toViewComment),
  };
}

export function entryResponseToViewEntry(response: EntryResponse): BlipEntry {
  const { entry, details, metadata, comments, image_urls } = response;
  return {
    entry_id: entry.entry_id_str,
    date: entry.date,
    title: entry.title,
    username: entry.username,
    journal_title: details?.journal_title ?? '',
    description: details?.description ?? '',
    description_html: details?.description_html ?? '',
    tags: details?.tags ?? [],
    location: entry.location,
    views_total: details?.views.total ?? 0,
    stars_total: details?.stars.total ?? 0,
    favorites_total: details?.favorites.total ?? 0,
    comments: (comments?.list ?? []).map(toViewComment),
    exif: metadata
      ? {
          make: metadata.Make,
          model: metadata.Model,
          camera: metadata.camera,
          exposure_time: metadata.ExposureTime,
          f_number: metadata.FNumber,
          focal_length: metadata.FocalLength,
          iso: metadata.ISO,
        }
      : null,
    images: {
      thumbnail: entry.thumbnail_url,
      // Standard resolution is this app's ceiling (rules.md) — hi-res/original are always null
      // for an independently-registered app, so there's nothing to populate them from.
      image: image_urls?.stdres ?? entry.image_url,
    },
  };
}
