// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type {
  ApiEnvelope,
  RateLimitInfo,
  FetchImpl,
  MultipartImpl,
  FileSource,
  UserProfileResponse,
  EntriesResponse,
  EntryResponse,
  ConfigCountriesResponse,
  ConfigLocalesResponse,
  ConfigTermsResponse,
  AwardsResponse,
  FriendshipsResponse,
  UsersResponse,
  TokenResponse,
  TokenWithUserResponse,
  JournalDayResponse,
  JournalMonthResponse,
  UserSettingsResponse,
  NotificationSettingsResponse,
  CommentResponse,
  CommentsRecentResponse,
  NotificationsRecentResponse,
  UnreadTotalsResponse,
  ReportReasons,
  SearchEntriesOptions,
  PublishEntryParams,
  UpdateEntryParams,
  UpdateUserSettingsParams,
} from './types.js';
import { BlipfotoError, NetworkError } from './errors.js';

function buildUrl(
  baseUrl: string,
  path: string,
  params: Record<string, string | number | undefined>,
): string {
  const url = new URL(`${path}.json`, baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function buildFormBody(params: Record<string, string | number | undefined>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      body.set(key, String(value));
    }
  }
  return body;
}

export class BlipfotoClient {
  private lastRateLimit: RateLimitInfo | null = null;

  constructor(
    private readonly accessToken: string,
    private readonly baseUrl: string = 'https://api.blipfoto.com/4/',
    private readonly fetchImpl: FetchImpl = (...args) => globalThis.fetch(...args),
    private readonly multipartImpl?: MultipartImpl,
  ) {}

  get rateLimitInfo(): RateLimitInfo | null {
    return this.lastRateLimit;
  }

  private updateRateLimit(headers: Headers | Record<string, string> | undefined): void {
    const get = (name: string): string | null => {
      if (!headers) return null;
      if (headers instanceof Headers) return headers.get(name);
      // A native transport's headers map isn't guaranteed to preserve casing.
      return headers[name] ?? headers[name.toLowerCase()] ?? null;
    };
    this.lastRateLimit = {
      limit: parseInt(get('X-RateLimit-Limit') ?? '-1', 10),
      remaining: parseInt(get('X-RateLimit-Remaining') ?? '-1', 10),
      resetInSeconds: parseInt(get('X-RateLimit-Reset') ?? '-1', 10),
    };
  }

  private parseEnvelopeBody<T>(bodyText: string): T {
    const envelope = JSON.parse(bodyText) as ApiEnvelope<T>;
    if (envelope.error !== null) {
      throw new BlipfotoError(envelope.error.code, envelope.error.message);
    }
    return envelope.data as T;
  }

  private async parseEnvelope<T>(response: Response): Promise<T> {
    this.updateRateLimit(response.headers);
    return this.parseEnvelopeBody<T>(await response.text());
  }

  private async request<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const url = buildUrl(this.baseUrl, path, params);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
    } catch (err) {
      throw new NetworkError('Network request failed', err);
    }
    return this.parseEnvelope<T>(response);
  }

  private async mutate<T>(
    method: 'POST' | 'PUT' | 'DELETE',
    path: string,
    body: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const url = new URL(`${path}.json`, this.baseUrl).toString();
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: buildFormBody(body),
      });
    } catch (err) {
      throw new NetworkError('Network request failed', err);
    }
    return this.parseEnvelope<T>(response);
  }

  private async mutateMultipart<T>(
    method: 'POST' | 'PUT',
    path: string,
    fields: Record<string, string | number | undefined>,
    file?: { fieldName: string; filename: string; source: FileSource },
  ): Promise<T> {
    const url = new URL(`${path}.json`, this.baseUrl).toString();

    if (this.multipartImpl) {
      const stringFields: Record<string, string> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) stringFields[key] = String(value);
      }
      let result: { status: number; headers?: Record<string, string>; body: string };
      try {
        result = await this.multipartImpl({
          url,
          method,
          headers: { Authorization: `Bearer ${this.accessToken}` },
          fields: stringFields,
          file,
        });
      } catch (err) {
        throw new NetworkError('Network request failed', err);
      }
      this.updateRateLimit(result.headers);
      return this.parseEnvelopeBody<T>(result.body);
    }

    // Default (web) path: FormData + Blob only — a native file path has nothing to read from
    // in a browser/WebView, and needs a multipartImpl (see app-architecture.md §7).
    if (file && !('blob' in file.source)) {
      throw new Error(
        'mutateMultipart received a native file path but no multipartImpl is configured — ' +
          'pass one to the BlipfotoClient constructor (see app-architecture.md §7).',
      );
    }
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) {
        form.set(key, String(value));
      }
    }
    if (file && 'blob' in file.source) {
      form.set(file.fieldName, file.source.blob, file.filename);
    }
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: { Authorization: `Bearer ${this.accessToken}` },
        body: form,
      });
    } catch (err) {
      throw new NetworkError('Network request failed', err);
    }
    return this.parseEnvelope<T>(response);
  }

  // ── Config ────────────────────────────────────────────────────────────────

  async getCountries(): Promise<ConfigCountriesResponse> {
    return this.request<ConfigCountriesResponse>('config/countries');
  }

  async getLocales(): Promise<ConfigLocalesResponse> {
    return this.request<ConfigLocalesResponse>('config/locales');
  }

  async getTerms(): Promise<ConfigTermsResponse> {
    return this.request<ConfigTermsResponse>('config/terms');
  }

  // ── Entry lists ───────────────────────────────────────────────────────────

  async getFavoriteEntries(options?: {
    username?: string;
    pageIndex?: number;
    pageSize?: number;
  }): Promise<EntriesResponse> {
    return this.request<EntriesResponse>('entries/favorites', {
      username: options?.username,
      page_index: options?.pageIndex,
      page_size: options?.pageSize,
    });
  }

  /** User auth only */
  async getFollowingEntries(options?: {
    pageIndex?: number;
    pageSize?: number;
  }): Promise<EntriesResponse> {
    return this.request<EntriesResponse>('entries/following', {
      page_index: options?.pageIndex,
      page_size: options?.pageSize,
    });
  }

  async getJournalEntries(options?: {
    username?: string;
    pageIndex?: number;
    pageSize?: number;
  }): Promise<EntriesResponse> {
    return this.request<EntriesResponse>('entries/journal', {
      username: options?.username,
      page_index: options?.pageIndex,
      page_size: options?.pageSize,
    });
  }

  async getRecentEntries(options?: {
    pageIndex?: number;
    pageSize?: number;
  }): Promise<EntriesResponse> {
    return this.request<EntriesResponse>('entries/recent', {
      page_index: options?.pageIndex,
      page_size: options?.pageSize,
    });
  }

  async getPopularEntries(options?: {
    pageIndex?: number;
    pageSize?: number;
  }): Promise<EntriesResponse> {
    return this.request<EntriesResponse>('entries/popular', {
      page_index: options?.pageIndex,
      page_size: options?.pageSize,
    });
  }

  async getNewEntries(options?: {
    pageIndex?: number;
    pageSize?: number;
  }): Promise<EntriesResponse> {
    return this.request<EntriesResponse>('entries/new', {
      page_index: options?.pageIndex,
      page_size: options?.pageSize,
    });
  }

  /** User auth only */
  async searchEntries(options: SearchEntriesOptions): Promise<EntriesResponse> {
    const params: Record<string, string | number | undefined> = {
      query: options.query,
      sort: options.sort,
      page_index: options.pageIndex,
      page_size: options.pageSize,
    };
    if (options.location_type === 'radial') {
      params.location_type = 'radial';
      params.lat = options.lat;
      params.lon = options.lon;
      params.distance = options.distance;
    } else if (options.location_type === 'bounding_box') {
      params.location_type = 'bounding_box';
      params.min_lat = options.min_lat;
      params.max_lat = options.max_lat;
      params.min_lon = options.min_lon;
      params.max_lon = options.max_lon;
    }
    return this.request<EntriesResponse>('entries/search', params);
  }

  // ── Single entry ──────────────────────────────────────────────────────────

  async getEntry(
    entryId: string,
    options?: {
      returnDetails?: boolean;
      returnMetadata?: boolean;
      returnComments?: boolean;
      includeReplies?: boolean;
      returnRelated?: boolean;
      returnFriendships?: boolean;
      returnActions?: boolean;
      returnImageUrls?: boolean;
    },
  ): Promise<EntryResponse> {
    return this.request<EntryResponse>('entry', {
      entry_id: entryId,
      return_details: options?.returnDetails ? 1 : undefined,
      return_metadata: options?.returnMetadata ? 1 : undefined,
      return_comments: options?.returnComments ? 1 : undefined,
      include_replies: options?.returnComments && options?.includeReplies ? 1 : undefined,
      return_related: options?.returnRelated ? 1 : undefined,
      return_friendships: options?.returnFriendships ? 1 : undefined,
      return_actions: options?.returnActions ? 1 : undefined,
      return_image_urls: options?.returnImageUrls ? 1 : undefined,
    });
  }

  // ── Entry CRUD (User auth only) ───────────────────────────────────────────

  async publishEntry(params: PublishEntryParams): Promise<EntryResponse> {
    const { image, ...rest } = params;
    const fields: Record<string, string | number | undefined> = {
      date: rest.date,
      title: rest.title,
      description: rest.description,
      tags: rest.tags,
      lat: rest.lat,
      lon: rest.lon,
      display_location: rest.display_location,
      thumbnail_crop: rest.thumbnail_crop,
      facebook_publish_entry: rest.facebook_publish_entry,
      twitter_publish_entry: rest.twitter_publish_entry,
      gmt_offset: rest.gmt_offset,
      exif_Make: rest.exif_Make,
      exif_Model: rest.exif_Model,
      exif_ExposureTime: rest.exif_ExposureTime,
      exif_FNumber: rest.exif_FNumber,
      exif_FocalLength: rest.exif_FocalLength,
      exif_ISO: rest.exif_ISO,
      exif_Orientation: rest.exif_Orientation,
    };
    return this.mutateMultipart<EntryResponse>('POST', 'entry', fields, {
      fieldName: 'image',
      filename: 'image.jpg',
      source: image,
    });
  }

  async updateEntry(params: UpdateEntryParams): Promise<EntryResponse> {
    const { entryId, image, ...rest } = params;
    const fields: Record<string, string | number | undefined> = {
      entry_id: entryId,
      date: rest.date,
      title: rest.title,
      description: rest.description,
      tags: rest.tags,
      lat: rest.lat,
      lon: rest.lon,
      display_location: rest.display_location,
      exif_Make: rest.exif_Make,
      exif_Model: rest.exif_Model,
      exif_ExposureTime: rest.exif_ExposureTime,
      exif_FNumber: rest.exif_FNumber,
      exif_FocalLength: rest.exif_FocalLength,
      exif_ISO: rest.exif_ISO,
      exif_Orientation: rest.exif_Orientation,
    };
    return this.mutateMultipart<EntryResponse>(
      'PUT',
      'entry',
      fields,
      image ? { fieldName: 'image', filename: 'image.jpg', source: image } : undefined,
    );
  }

  async deleteEntry(entryId: string): Promise<{ success: number }> {
    return this.mutate<{ success: number }>('DELETE', 'entry', { entry_id: entryId });
  }

  // ── Comments (User auth only) ─────────────────────────────────────────────

  async postComment(params: {
    entryId: string;
    content: string;
    parentId?: string;
  }): Promise<CommentResponse> {
    return this.mutate<CommentResponse>('POST', 'entry/comment', {
      entry_id: params.entryId,
      content: params.content,
      parent_id: params.parentId,
    });
  }

  async updateComment(params: { commentId: string; content: string }): Promise<CommentResponse> {
    return this.mutate<CommentResponse>('PUT', 'entry/comment', {
      comment_id: params.commentId,
      content: params.content,
    });
  }

  async deleteComment(commentId: string): Promise<{ success: number }> {
    return this.mutate<{ success: number }>('DELETE', 'entry/comment', {
      comment_id: commentId,
    });
  }

  // ── Interactions (User auth only) ─────────────────────────────────────────

  async favoriteEntry(entryId: string): Promise<{ success: number }> {
    return this.mutate<{ success: number }>('POST', 'entry/favorite', { entry_id: entryId });
  }

  async starEntry(entryId: string): Promise<{ success: number }> {
    return this.mutate<{ success: number }>('POST', 'entry/star', { entry_id: entryId });
  }

  async reportEntry(
    entryId: string,
    reasons: ReportReasons,
    comment?: string,
  ): Promise<{ success: number }> {
    return this.mutate<{ success: number }>('POST', 'entry/report', {
      entry_id: entryId,
      reason_explicit: reasons.reason_explicit,
      reason_inappropriate_content: reasons.reason_inappropriate_content,
      reason_copyright: reasons.reason_copyright,
      reason_promotional: reasons.reason_promotional,
      reason_incorrect_date: reasons.reason_incorrect_date,
      comment,
    });
  }

  // ── Calendar (User auth only) ─────────────────────────────────────────────

  async getJournalDay(date: string): Promise<JournalDayResponse> {
    return this.request<JournalDayResponse>('journal/day', { date });
  }

  async getJournalMonth(
    date: string,
    options?: { username?: string; weekStart?: number },
  ): Promise<JournalMonthResponse> {
    return this.request<JournalMonthResponse>('journal/month', {
      date,
      username: options?.username,
      week_start: options?.weekStart,
    });
  }

  // ── Messages (User auth only) ─────────────────────────────────────────────

  async getRecentComments(options?: {
    size?: number;
    sinceId?: string;
  }): Promise<CommentsRecentResponse> {
    return this.request<CommentsRecentResponse>('messages/comments/recent', {
      size: options?.size,
      since_id: options?.sinceId,
    });
  }

  async getRecentNotifications(options?: {
    size?: number;
    sinceId?: string;
  }): Promise<NotificationsRecentResponse> {
    return this.request<NotificationsRecentResponse>('messages/notifications/recent', {
      size: options?.size,
      since_id: options?.sinceId,
    });
  }

  async markNotificationsRead(notificationIds: string[]): Promise<{ success: number }> {
    return this.mutate<{ success: number }>('PUT', 'messages/notifications/unread', {
      notification_ids: notificationIds.join(','),
    });
  }

  async getUnreadTotals(options?: {
    returnComments?: boolean;
    returnNotifications?: boolean;
  }): Promise<UnreadTotalsResponse> {
    return this.request<UnreadTotalsResponse>('messages/totals/unread', {
      return_comments: options?.returnComments ? 1 : undefined,
      return_notifications: options?.returnNotifications ? 1 : undefined,
    });
  }

  // ── OAuth ─────────────────────────────────────────────────────────────────

  /** Verify the token in use was issued to your app (Implicit Grant flow). */
  async verifyToken(clientId: string): Promise<{ username: string }> {
    return this.request<{ username: string }>('oauth/token', { client_id: clientId });
  }

  /** Exchange an authorization code for an access token (Authorization Code flow, App auth). */
  async exchangeCode(params: {
    clientId: string;
    code: string;
    redirectUri: string;
  }): Promise<TokenResponse> {
    return this.mutate<TokenResponse>('POST', 'oauth/token', {
      client_id: params.clientId,
      grant_type: 'authorization_code',
      code: params.code,
      redirect_uri: params.redirectUri,
    });
  }

  /** Obtain a token using resource owner password credentials (App auth). */
  async loginWithPassword(params: {
    clientId: string;
    scope: 'read' | 'read,write';
    username: string;
    password: string;
    returnUser?: boolean;
  }): Promise<TokenWithUserResponse> {
    return this.mutate<TokenWithUserResponse>('POST', 'oauth/token', {
      client_id: params.clientId,
      grant_type: 'password',
      scope: params.scope,
      username: params.username,
      password: params.password,
      return_user: params.returnUser ? 1 : undefined,
    });
  }

  /** Delete the access token in use (sign-out). User auth only. */
  async revokeToken(): Promise<{ success: number }> {
    return this.mutate<{ success: number }>('DELETE', 'oauth/token');
  }

  // ── User profile ──────────────────────────────────────────────────────────

  async getUserProfile(options?: {
    username?: string;
    returnDetails?: boolean;
    returnEntries?: boolean;
    returnFriendship?: boolean;
  }): Promise<UserProfileResponse> {
    return this.request<UserProfileResponse>('user/profile', {
      username: options?.username,
      return_details: options?.returnDetails ? 1 : undefined,
      return_entries: options?.returnEntries ? 1 : undefined,
      return_friendship: options?.returnFriendship ? 1 : undefined,
    });
  }

  async getUserAwards(options?: { username?: string }): Promise<AwardsResponse> {
    return this.request<AwardsResponse>('user/awards', { username: options?.username });
  }

  /** User auth only */
  async getUserSettings(): Promise<UserSettingsResponse> {
    return this.request<UserSettingsResponse>('user/settings');
  }

  /** User auth only */
  async updateUserSettings(params: UpdateUserSettingsParams): Promise<{ success: number }> {
    const { avatar, ...rest } = params;
    const fields: Record<string, string | number | undefined> = {
      username: rest.username,
      journal_title: rest.journal_title,
      real_name: rest.real_name,
      real_name_search: rest.real_name_search,
      biography: rest.biography,
      locale_code: rest.locale_code,
      country_code: rest.country_code,
      privacy: rest.privacy,
      comments: rest.comments,
      delete_avatar: rest.delete_avatar,
    };
    return this.mutateMultipart<{ success: number }>(
      'PUT',
      'user/settings',
      fields,
      avatar ? { fieldName: 'avatar', filename: 'avatar.jpg', source: avatar } : undefined,
    );
  }

  /** User auth only */
  async getNotificationSettings(options?: {
    returnFeed?: boolean;
    returnEmail?: boolean;
    returnPush?: boolean;
  }): Promise<NotificationSettingsResponse> {
    return this.request<NotificationSettingsResponse>('user/settings/notifications', {
      return_feed: options?.returnFeed ? 1 : undefined,
      return_email: options?.returnEmail ? 1 : undefined,
      return_push: options?.returnPush ? 1 : undefined,
    });
  }

  /** User auth only */
  async updateNotificationSettings(settings: Record<string, 0 | 1>): Promise<{ success: number }> {
    return this.mutate<{ success: number }>('PUT', 'user/settings/notifications', settings);
  }

  // ── Social ────────────────────────────────────────────────────────────────

  async getFollowing(options?: {
    username?: string;
    pageIndex?: number;
    pageSize?: number;
  }): Promise<UsersResponse> {
    return this.request<UsersResponse>('users/following', {
      username: options?.username,
      page_index: options?.pageIndex,
      page_size: options?.pageSize,
    });
  }

  /** User auth only */
  async follow(usernames: string[]): Promise<FriendshipsResponse> {
    return this.mutate<FriendshipsResponse>('POST', 'users/following', {
      usernames: usernames.join(','),
    });
  }

  /** User auth only */
  async unfollow(usernames: string[]): Promise<FriendshipsResponse> {
    return this.mutate<FriendshipsResponse>('DELETE', 'users/following', {
      usernames: usernames.join(','),
    });
  }

  async getFollowers(options?: {
    username?: string;
    pageIndex?: number;
    pageSize?: number;
  }): Promise<UsersResponse> {
    return this.request<UsersResponse>('users/followers', {
      username: options?.username,
      page_index: options?.pageIndex,
      page_size: options?.pageSize,
    });
  }

  /** User auth only */
  async removeFollower(usernames: string[]): Promise<FriendshipsResponse> {
    return this.mutate<FriendshipsResponse>('DELETE', 'users/followers', {
      usernames: usernames.join(','),
    });
  }

  /** User auth only */
  async getPendingRequests(options?: {
    pageIndex?: number;
    pageSize?: number;
  }): Promise<UsersResponse> {
    return this.request<UsersResponse>('users/requests/pending', {
      page_index: options?.pageIndex,
      page_size: options?.pageSize,
    });
  }

  /** User auth only */
  async approvePendingRequests(usernames: string[]): Promise<FriendshipsResponse> {
    return this.mutate<FriendshipsResponse>('PUT', 'users/requests/pending', {
      usernames: usernames.join(','),
    });
  }

  /** User auth only */
  async rejectPendingRequests(usernames: string[]): Promise<FriendshipsResponse> {
    return this.mutate<FriendshipsResponse>('DELETE', 'users/requests/pending', {
      usernames: usernames.join(','),
    });
  }

  /** User auth only */
  async getBlockedUsers(options?: {
    pageIndex?: number;
    pageSize?: number;
  }): Promise<UsersResponse> {
    return this.request<UsersResponse>('users/requests/blocked', {
      page_index: options?.pageIndex,
      page_size: options?.pageSize,
    });
  }

  /** User auth only */
  async unblockUsers(usernames: string[]): Promise<FriendshipsResponse> {
    return this.mutate<FriendshipsResponse>('DELETE', 'users/requests/blocked', {
      usernames: usernames.join(','),
    });
  }

  /** User auth only */
  async searchUsers(options?: {
    query?: string;
    pageIndex?: number;
    pageSize?: number;
  }): Promise<UsersResponse> {
    return this.request<UsersResponse>('users/search', {
      query: options?.query,
      page_index: options?.pageIndex,
      page_size: options?.pageSize,
    });
  }
}
