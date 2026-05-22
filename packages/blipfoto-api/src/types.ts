// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

export interface ApiEnvelope<T> {
  version: number;
  error: { object: 'Error'; code: number; message: string } | null;
  data: T | null;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetInSeconds: number;
}

export interface BlipUser {
  username: string;
  avatar_url: string;
  icons: Array<{ icon_id_str: string; icon_url: string }>;
}

export interface BlipUserDetails {
  journal_title: string;
  biography: string;
  biography_html: string;
  country_code: string;
  entry_total: number;
  member: 0 | 1;
  privacy: 0 | 1;
}

export interface BlipEntryStub {
  entry_id_str: string;
  date: string;
  date_stamp: number;
  title: string;
  username: string;
  location: { lat: number; lon: number } | null;
  thumbnail_url: string;
  image_url: string;
}

export interface BlipEntryDetails {
  journal_title: string;
  description: string;
  description_html: string;
  tags: string[];
  views: { total: number };
  stars: { total: number; starred: 0 | 1 };
  favorites: { total: number; favorited: 0 | 1 };
}

export interface BlipEntryMetadata {
  Make: string | null;
  Model: string | null;
  ExposureTime: string | null;
  FNumber: string | null;
  FocalLength: string | null;
  ISO: string | null;
  camera: string | null;
}

export interface BlipComment {
  comment_id_str: string;
  parent_id_str: string | null;
  entry_id_str: string;
  thumbnail_url: string;
  content: string;
  content_html: string;
  commenter: Pick<BlipUser, 'username' | 'avatar_url'>;
  replies: BlipComment[] | null;
}

export interface BlipEntryComments {
  total: number;
  list: BlipComment[];
}

export interface BlipImageUrls {
  lores: string | null;
  stdres: string | null;
  hires: string | null;
  original: string | null;
}

export interface BlipEntryFull extends BlipEntryStub {
  details?: BlipEntryDetails;
  metadata?: BlipEntryMetadata;
  comments?: BlipEntryComments;
  image_urls?: BlipImageUrls;
}

export interface BlipPage {
  index: number;
  size: number;
  more: 0 | 1;
}

export interface UserProfileResponse {
  user: BlipUser;
  visibility: 0 | 1;
  details?: BlipUserDetails | null;
}

export interface JournalEntriesResponse {
  page: BlipPage;
  entries: BlipEntryStub[];
}

export interface EntryResponse {
  entry: BlipEntryFull;
}
