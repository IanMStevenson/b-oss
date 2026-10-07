// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A thin client for b-push's registration contract (notification-service.md "Registration
// contract"). Deliberately not b-api's BlipfotoClient — this talks to a different service
// entirely, with its own auth scheme (a shared build-time secret for POST, a per-registration
// bearer secret for everything else) and no Blipfoto envelope/error-code shape to parse. Uses
// platform/http.ts's platformFetch, same as data/client.ts, so it goes through the same
// native-vs-web transport rather than a bare `fetch()` that would be blocked or behave
// differently on device.

import { platformFetch } from '../platform/http.js';

const SERVICE_URL = import.meta.env.VITE_NOTIFY_SERVICE_URL ?? '';
const REGISTRATION_SECRET = import.meta.env.VITE_NOTIFY_REGISTRATION_SECRET ?? '';

export class PushServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'PushServiceError';
  }
}

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; bearer?: string } = {},
): Promise<T> {
  const response = await platformFetch(`${SERVICE_URL}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      // `!== undefined`, not truthy — every call site below always passes *some* bearer value,
      // even an accidentally-empty one (e.g. VITE_NOTIFY_REGISTRATION_SECRET unset in dev); the
      // request should visibly fail auth against the service rather than silently going out with
      // no Authorization header at all, which would be a harder-to-diagnose failure mode.
      ...(init.bearer !== undefined ? { Authorization: `Bearer ${init.bearer}` } : {}),
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  if (!response.ok) {
    let message = `b-push request failed (${response.status})`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      // Non-JSON error body — keep the generic message above.
    }
    throw new PushServiceError(response.status, message);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export type PushPlatform = 'android' | 'ios';

export interface CreateRegistrationResult {
  registrationId: string;
  registrationSecret: string;
}

/** The two per-account push streams (b-oss#244). Stored by b-push, sent at registration and
 * changed by `PATCH`; both default to on server-side when omitted. */
export interface PushStreamFlags {
  pushComments?: boolean;
  pushNotifications?: boolean;
}

/** `POST /v1/registrations` — `blipfotoUserId` is the account's username: `b-api` exposes no
 * numeric user id anywhere (the same platform limitation `SCR-23`/`SCR-24`'s hidden-member-by-
 * username design already documents), so the username is the only stable identifier this app can
 * hand the service. */
export function createRegistration(
  params: {
    blipfotoUserId: string;
    readToken: string;
    deviceToken: string;
    platform: PushPlatform;
  } & PushStreamFlags,
): Promise<CreateRegistrationResult> {
  return request<CreateRegistrationResult>('/v1/registrations', {
    method: 'POST',
    bearer: REGISTRATION_SECRET,
    body: params,
  });
}

export function patchRegistration(
  registrationId: string,
  registrationSecret: string,
  patch: {
    readToken?: string;
    deviceToken?: string;
    pollIntervalMinutes?: number;
  } & PushStreamFlags,
): Promise<void> {
  return request<void>(`/v1/registrations/${encodeURIComponent(registrationId)}`, {
    method: 'PATCH',
    bearer: registrationSecret,
    body: patch,
  });
}

export interface RegistrationStatusResult {
  status: 'active' | 'read-token-invalid';
  lastPolledAt: number | null;
  /** Optional: a service deployed before b-oss#244 doesn't return them. */
  pushComments?: boolean;
  pushNotifications?: boolean;
}

/** The launch-time backstop's `GET` (FLW-16 step 8) — a fallback for a missed push, not polled
 * in normal operation. */
export function getRegistrationStatus(
  registrationId: string,
  registrationSecret: string,
): Promise<RegistrationStatusResult> {
  return request<RegistrationStatusResult>(
    `/v1/registrations/${encodeURIComponent(registrationId)}`,
    { bearer: registrationSecret },
  );
}

export function deleteRegistration(
  registrationId: string,
  registrationSecret: string,
): Promise<void> {
  return request<void>(`/v1/registrations/${encodeURIComponent(registrationId)}`, {
    method: 'DELETE',
    bearer: registrationSecret,
  });
}
