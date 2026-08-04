// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Shared types: the Worker's env bindings, the registrations row shape, and the registration
// contract's request/response bodies (notification-service.md "Registration contract").

export interface Env {
  DB: D1Database;
  /** Base64, 32 raw bytes — AES-256-GCM key for read_token at rest (notification-service.md
   * "Security notes": a single static Worker secret, random nonce per row). */
  READ_TOKEN_ENCRYPTION_KEY: string;
  /** The shared, build-time constant every app install presents on POST /v1/registrations — "a
   * coarse gate, not a credential" (notification-service.md). Must match the app build's
   * VITE_NOTIFY_REGISTRATION_SECRET. */
  REGISTRATION_SECRET: string;
  /** A Firebase service-account key file's JSON contents, as a string — used to sign the FCM
   * HTTP v1 OAuth2 JWT (src/fcm.ts). */
  FCM_SERVICE_ACCOUNT_JSON: string;
}

export type Platform = 'android' | 'ios';
export type RegistrationStatus = 'active' | 'read-token-invalid';

/** The `registrations` table row (src/schema.sql), as read back from D1. */
export interface RegistrationRow {
  id: string;
  secret_hash: string;
  blipfoto_user_id: string;
  read_token_ciphertext: string;
  read_token_nonce: string;
  device_token: string;
  platform: Platform;
  poll_interval_minutes: number;
  last_polled_at: number | null;
  last_seen_comments_total: number;
  last_seen_notifications_total: number;
  cached_push_prefs: string | null;
  prefs_fetched_at: number | null;
  status: RegistrationStatus;
  created_at: number;
}

// ── Registration contract bodies (notification-service.md) ────────────────────────────────────

export interface CreateRegistrationBody {
  blipfotoUserId: string;
  readToken: string;
  deviceToken: string;
  platform: Platform;
}

export interface CreateRegistrationResult {
  registrationId: string;
  registrationSecret: string;
}

export interface PatchRegistrationBody {
  readToken?: string;
  deviceToken?: string;
  pollIntervalMinutes?: number;
}

export interface RegistrationStatusResult {
  status: RegistrationStatus;
  lastPolledAt: number | null;
}
