// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type {
  ApiEnvelope,
  RateLimitInfo,
  UserProfileResponse,
  JournalEntriesResponse,
  EntryResponse,
} from './types.js';
import { BlipfotoError, NetworkError } from './errors.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

export class BlipfotoClient {
  private lastRateLimit: RateLimitInfo | null = null;

  constructor(
    private readonly accessToken: string,
    private readonly baseUrl: string = 'https://api.blipfoto.com/4/',
  ) {}

  get rateLimitInfo(): RateLimitInfo | null {
    return this.lastRateLimit;
  }

  private async request<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    const url = buildUrl(this.baseUrl, path, params);
    let response: Response;
    try {
      response = await globalThis.fetch(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
    } catch (err) {
      throw new NetworkError('Network request failed', err);
    }

    const envelope = (await response.json()) as ApiEnvelope<T>;

    this.lastRateLimit = {
      limit: parseInt(response.headers.get('X-RateLimit-Limit') ?? '-1', 10),
      remaining: parseInt(response.headers.get('X-RateLimit-Remaining') ?? '-1', 10),
      resetInSeconds: parseInt(response.headers.get('X-RateLimit-Reset') ?? '-1', 10),
    };

    if (envelope.error !== null) {
      throw new BlipfotoError(envelope.error.code, envelope.error.message);
    }

    return envelope.data as T;
  }

  private async requestWithRateLimitRetry<T>(
    path: string,
    params: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    try {
      return await this.request<T>(path, params);
    } catch (err) {
      if (err instanceof BlipfotoError && err.isRateLimited) {
        const waitMs = (this.lastRateLimit!.resetInSeconds + 1) * 1000;
        await sleep(waitMs);
        return await this.request<T>(path, params);
      }
      throw err;
    }
  }

  async getUserProfile(options?: {
    username?: string;
    returnDetails?: boolean;
  }): Promise<UserProfileResponse> {
    return this.requestWithRateLimitRetry<UserProfileResponse>('user/profile', {
      username: options?.username,
      return_details: options?.returnDetails ? 1 : undefined,
    });
  }

  async getJournalEntries(options?: {
    username?: string;
    pageIndex?: number;
    pageSize?: number;
  }): Promise<JournalEntriesResponse> {
    return this.requestWithRateLimitRetry<JournalEntriesResponse>('entries/journal', {
      username: options?.username,
      page_index: options?.pageIndex,
      page_size: options?.pageSize,
    });
  }

  async getEntry(
    entryId: string,
    options?: {
      returnDetails?: boolean;
      returnMetadata?: boolean;
      returnComments?: boolean;
      includeReplies?: boolean;
      returnImageUrls?: boolean;
    },
  ): Promise<EntryResponse> {
    return this.requestWithRateLimitRetry<EntryResponse>('entry', {
      entry_id: entryId,
      return_details: options?.returnDetails ? 1 : undefined,
      return_metadata: options?.returnMetadata ? 1 : undefined,
      return_comments: options?.returnComments ? 1 : undefined,
      include_replies: options?.returnComments && options?.includeReplies ? 1 : undefined,
      return_image_urls: options?.returnImageUrls ? 1 : undefined,
    });
  }

  async verifyToken(clientId: string): Promise<{ username: string }> {
    return this.request<{ username: string }>('oauth/token', {
      client_id: clientId,
    });
  }
}
