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

// ── Objects ──────────────────────────────────────────────────────────────────

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

export interface BlipEntryRelated {
  previous: BlipEntryStub | null;
  next: BlipEntryStub | null;
  year_ago: BlipEntryStub | null;
  year_ahead: BlipEntryStub | null;
}

export interface BlipEntryActions {
  star: 0 | 1;
  favorite: 0 | 1;
  comment: 0 | 1;
  edit: 0 | 1 | 2;
  delete: 0 | 1;
}

export interface BlipComment {
  comment_id_str: string;
  parent_id_str: string | null;
  entry_id_str: string | null;
  thumbnail_url: string;
  content: string;
  content_html: string;
  commenter: Pick<BlipUser, 'username' | 'avatar_url'>;
  actions: { reply: 0 | 1; edit: 0 | 1; delete: 0 | 1 };
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

export interface BlipPage {
  index: number;
  size: number;
  more: 0 | 1;
}

export interface BlipAward {
  award_id_str: string;
  icon_url: string;
  added_stamp: number | null;
  secret: 0 | 1;
}

export interface BlipDay {
  day: number;
  month: number;
  year: number;
  /** 0=empty 1=has entry 2=suspended 3=future 4=too old 5=blocked */
  state: 0 | 1 | 2 | 3 | 4 | 5;
  entry: BlipEntryStub | null;
  actions: { publish: 0 | 1 };
}

export interface BlipFriendship {
  source: string | null;
  target: string | null;
  /** 0=not following 1=following 2=pending 3=blocked */
  state: 0 | 1 | 2 | 3;
  actions: { follow: 0 | 1; unfollow: 0 | 1 };
}

export interface BlipToken {
  access_token: string;
  scope: string;
  token_type: string;
  username: string;
}

export interface BlipNotification {
  notification_id_str: string;
  content: string;
  content_html: string;
  image_url: string;
  link_url: string;
}

// ── Response types ────────────────────────────────────────────────────────────

export interface UserProfileResponse {
  user: BlipUser;
  visibility: 0 | 1;
  details?: BlipUserDetails | null;
  entries?: { latest: BlipEntryStub } | null;
  friendship?: BlipFriendship;
}

export interface EntriesResponse {
  page: BlipPage;
  entries: BlipEntryStub[];
}

/** @deprecated Use EntriesResponse */
export type JournalEntriesResponse = EntriesResponse;

export interface EntryResponse {
  entry: BlipEntryStub;
  details?: BlipEntryDetails;
  metadata?: BlipEntryMetadata;
  comments?: BlipEntryComments;
  related?: BlipEntryRelated;
  friendships?: BlipFriendship[];
  actions?: BlipEntryActions;
  image_urls?: BlipImageUrls;
}

export interface ConfigCountriesResponse {
  countries: Array<{ country_code: string; title: string }>;
}

export interface ConfigLocalesResponse {
  locales: Array<{ locale_code: string; title: string }>;
}

export interface ConfigTermsResponse {
  reserved: string[];
}

export interface AwardsResponse {
  awards: BlipAward[];
}

export interface FriendshipsResponse {
  friendships: BlipFriendship[];
}

export interface UsersResponse {
  page: BlipPage;
  users: BlipUser[];
}

export interface TokenResponse {
  token: BlipToken;
}

export interface TokenWithUserResponse {
  token: BlipToken;
  user?: BlipUser;
}

export interface JournalDayResponse {
  day: BlipDay;
}

export interface JournalMonthResponse {
  month: number;
  year: number;
  week_start: number;
  days: Array<BlipDay | null>;
}

export interface UserSettingsResponse {
  username: string;
  journal_title: string;
  real_name: string;
  real_name_search: 0 | 1;
  biography: string;
  locale_code: string;
  country_code: string;
  privacy: 0 | 1;
  comments: 0 | 1;
  avatar_url: string;
}

export interface NotificationChannel {
  configured: 0 | 1;
  settings: Record<string, 0 | 1> | null;
}

export interface NotificationSettingsResponse {
  feed?: NotificationChannel;
  email?: NotificationChannel;
  push?: NotificationChannel;
}

export interface CommentResponse {
  comment: BlipComment;
}

export interface CommentsRecentResponse {
  comments: BlipComment[];
}

export interface NotificationsRecentResponse {
  notifications: BlipNotification[];
}

export interface UnreadTotalsResponse {
  comments?: number;
  notifications?: number;
}

// ── Parameter types ───────────────────────────────────────────────────────────

export type ReportReasons = {
  reason_explicit?: 1;
  reason_inappropriate_content?: 1;
  reason_copyright?: 1;
  reason_promotional?: 1;
  reason_incorrect_date?: 1;
};

export type SearchEntriesLocationType =
  | { location_type: 'radial'; lat: number; lon: number; distance?: number }
  | {
      location_type: 'bounding_box';
      min_lat: number;
      max_lat: number;
      min_lon: number;
      max_lon: number;
    };

export type SearchEntriesOptions = {
  query?: string;
  sort?: 'date' | 'relevancy' | 'location';
  pageIndex?: number;
  pageSize?: number;
} & (SearchEntriesLocationType | { location_type?: undefined });

export interface PublishEntryParams {
  image: Blob;
  date?: string;
  title?: string;
  description?: string;
  tags?: string;
  lat?: number;
  lon?: number;
  display_location?: 0 | 1;
  thumbnail_crop?: string;
  facebook_publish_entry?: 0 | 1;
  twitter_publish_entry?: 0 | 1;
  gmt_offset?: number;
  exif_Make?: string;
  exif_Model?: string;
  exif_ExposureTime?: string;
  exif_FNumber?: string;
  exif_FocalLength?: string;
  exif_ISO?: string;
  exif_Orientation?: number;
}

export interface UpdateEntryParams {
  entryId: string;
  image?: Blob;
  date?: string;
  title?: string;
  description?: string;
  tags?: string;
  lat?: number;
  lon?: number;
  display_location?: 0 | 1;
  exif_Make?: string;
  exif_Model?: string;
  exif_ExposureTime?: string;
  exif_FNumber?: string;
  exif_FocalLength?: string;
  exif_ISO?: string;
  exif_Orientation?: number;
}

export interface UpdateUserSettingsParams {
  username?: string;
  journal_title?: string;
  real_name?: string;
  real_name_search?: 0 | 1;
  biography?: string;
  locale_code?: string;
  country_code?: string;
  privacy?: 0 | 1;
  comments?: 0 | 1;
  avatar?: Blob;
  delete_avatar?: 1;
}
