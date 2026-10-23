// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Shared types: the Worker's bindings, the probe's check/state vocabulary and the stored rows.

export interface Env {
  DB: D1Database;
  /** The dedicated "status monitor" API app's client id (a Worker secret, b-oss#487). Absent until
   * that app is registered: the API checks are then skipped and the API state is Unknown. */
  MONITOR_CLIENT_ID?: string;
}

export type CheckId = 'website_browse' | 'website_entry' | 'photo' | 'api_recent' | 'api_entry';

/** `skipped` = could not run (its input failed or is missing). It is NOT a failure, so one root
 * cause is never counted three times. */
export type CheckStatus = 'pass' | 'fail' | 'skipped';

export interface CheckResult {
  id: CheckId;
  status: CheckStatus;
  /** Wall-clock latency of the request(s) in ms; 0 when skipped. */
  ms: number;
  /** Short plain reason for a fail/skip, never a response body. */
  detail?: string;
}

export type Component = 'site' | 'api';
export type State = 'up' | 'down' | 'unknown';

export interface ComponentState {
  state: State;
  /** Check ids that failed (empty unless down). */
  failed: CheckId[];
}

export type DerivedStates = Record<Component, ComponentState>;

export interface SampleRow {
  slot: number;
  ts: number;
  site_state: State;
  api_state: State;
  retried: number;
  checks: string;
}

export interface IncidentRow {
  id: number;
  component: Component;
  started_at: number;
  ended_at: number | null;
  failed_checks: string;
}
