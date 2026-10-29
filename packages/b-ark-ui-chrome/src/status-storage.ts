// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Single source of truth for the extension's persisted backup status.
//
// Two representations are kept in lock-step here:
//   • `b_ark_status`  — the rich status the page reads via getStore() (drives the AuthErrorBanner).
//   • `chip_*` keys   — the flat values the draggable chip content-script reads directly.
//
// The RAG model (see plan):
//   RED   = a run aborted with an error (auth / permission / network / api).
//   AMBER = working, or incomplete-but-not-errored (resume in progress, cancelled, or a run
//           that completed with entries not archived yet).
//   GREEN = a run reached `completed` with nothing outstanding.

import type { BackupErrorPayload, OutstandingCounts } from '@b-oss/backup-engine';
import type { NetworkFailure, RagReason } from '@b-oss/b-ark-ui-components';

// ── Persisted shapes ────────────────────────────────────────────────────────

export type RagState = 'green' | 'amber' | 'red';

/** What the chip shows when red. `error` covers network / api failures. */
export type ChipErrorKind = 'permission' | 'auth' | 'error' | null;

/** Set to 'rate' while the backup engine is paused at a rate limit. */
export type ChipAmberReason = 'rate' | null;

export interface ChromeStatus {
  last_backup_at: string | null;
  total_archived: number;
  journal_entry_total: number;
  rag_state: RagState;
  error_message: string | null;
  /** Why the journal is amber; see RagReason. */
  rag_reasons?: RagReason[];
  /** The last run stopped because Blipfoto couldn't be reached; see NetworkFailure. */
  network_failure?: NetworkFailure | null;
}

/** Every chip_* key this module owns — the single list used to clear chip state. */
const CHIP_KEYS = [
  'chip_rag',
  'chip_progress',
  'chip_error_kind',
  'chip_amber_reason',
  'chip_incomplete',
  'chip_last_backup_at',
  'chip_avatar_url',
] as const;

// ── Low-level access to b_ark_status ──────────────────────────────────────────

export async function readStatus(): Promise<Partial<ChromeStatus>> {
  const r = await chrome.storage.local.get('b_ark_status');
  return (r['b_ark_status'] as Partial<ChromeStatus>) ?? {};
}

export async function patchStatus(partial: Partial<ChromeStatus>): Promise<void> {
  const current = await readStatus();
  await chrome.storage.local.set({ b_ark_status: { ...current, ...partial } });
}

// ── Error-kind mapping ────────────────────────────────────────────────────────

function chipKindFor(kind: BackupErrorPayload['kind']): ChipErrorKind {
  switch (kind) {
    case 'auth_expired':
      return 'auth';
    case 'filesystem':
      return 'permission';
    case 'network':
    case 'api_error':
    case 'unexpected':
      return 'error';
  }
}

// ── State transitions (write b_ark_status + chip_* together) ──────────────────

/** A run started / resumed — the first successful network transaction proves it works. */
export async function setWorking(): Promise<void> {
  await patchStatus({
    rag_state: 'amber',
    error_message: null,
    rag_reasons: [],
    network_failure: null,
  });
  await chrome.storage.local.set({
    chip_rag: 'amber',
    chip_incomplete: true,
    chip_error_kind: null,
    chip_progress: null,
    chip_amber_reason: null,
  });
}

function outstandingReasons(outstanding: OutstandingCounts | null): RagReason[] {
  return outstanding ? [{ code: 'outstanding', ...outstanding }] : [];
}

/**
 * The outstanding-entries reason changed between runs (the user dismissed or retried): update
 * the colour to match without touching any other reason. Never lowers a red status.
 */
export async function setOutstanding(outstanding: OutstandingCounts | null): Promise<void> {
  const current = await readStatus();
  if (current.rag_state === 'red') return;
  const others = (current.rag_reasons ?? []).filter((r) => r.code !== 'outstanding');
  const rag_reasons = [...others, ...outstandingReasons(outstanding)];
  const rag: RagState = rag_reasons.length > 0 ? 'amber' : 'green';
  await patchStatus({ rag_state: rag, rag_reasons });
  await chrome.storage.local.set({ chip_rag: rag });
}

/** A run finished cleanly. */
export async function setCompleted(
  nowIso: string,
  totalArchived: number,
  outstanding: OutstandingCounts | null = null,
): Promise<void> {
  // Entries not archived yet leave the backup amber, not green. The run itself finished, so
  // it is complete as far as the service worker's auto-resume is concerned.
  const rag: RagState = outstanding ? 'amber' : 'green';
  await patchStatus({
    last_backup_at: nowIso,
    total_archived: totalArchived,
    rag_state: rag,
    error_message: null,
    rag_reasons: outstandingReasons(outstanding),
    network_failure: null,
  });
  await chrome.storage.local.set({
    chip_rag: rag,
    chip_incomplete: false,
    chip_progress: null,
    chip_last_backup_at: nowIso,
    chip_error_kind: null,
  });
}

/** A run was cancelled — leaves an incomplete (amber), non-error state. */
export async function setCancelledIncomplete(): Promise<void> {
  await patchStatus({
    rag_state: 'amber',
    error_message: null,
    rag_reasons: [{ code: 'incomplete' }],
    network_failure: null,
  });
  await chrome.storage.local.set({
    chip_rag: 'amber',
    chip_incomplete: true,
    chip_error_kind: null,
    chip_progress: null,
    chip_amber_reason: null,
  });
}

/** The backup engine hit a rate limit — keeps chip_progress frozen so the pill stays visible. */
export async function setRateLimited(): Promise<void> {
  await chrome.storage.local.set({ chip_amber_reason: 'rate' });
}

/** A run aborted with an error — goes red with the correct chip label. */
export async function setFailed(
  kind: BackupErrorPayload['kind'],
  message: string,
  networkFailure: NetworkFailure | null = null,
): Promise<void> {
  await patchStatus({
    rag_state: 'red',
    error_message: message,
    rag_reasons: [],
    network_failure: kind === 'network' ? networkFailure : null,
  });
  await chrome.storage.local.set({
    chip_rag: 'red',
    chip_error_kind: chipKindFor(kind),
    chip_progress: null,
  });
}

/** Remediation succeeded (reauthorise / folder grant) — clear red to amber. */
export async function clearError(): Promise<void> {
  await patchStatus({
    rag_state: 'amber',
    error_message: null,
    rag_reasons: [{ code: 'incomplete' }],
    network_failure: null,
  });
  await chrome.storage.local.set({
    chip_rag: 'amber',
    chip_incomplete: true,
    chip_error_kind: null,
  });
}

// ── Chip-only updates (no b_ark_status change) ────────────────────────────────

/**
 * Reset the chip to a clean "about to run" state before the first network call,
 * for immediate UI feedback ahead of the engine's first `started` event.
 */
export async function setStarting(): Promise<void> {
  await chrome.storage.local.set({
    chip_rag: 'amber',
    chip_incomplete: true,
    chip_progress: null,
    chip_error_kind: null,
  });
}

/** Update the live progress pill (clears any rate-limit amber reason). */
export async function setProgress(progress: { done: number; total: number } | null): Promise<void> {
  await chrome.storage.local.set({ chip_progress: progress, chip_amber_reason: null });
}

/** Cache the account avatar as a data-URL for the chip content-script. */
export async function setAvatar(dataUrl: string): Promise<void> {
  await chrome.storage.local.set({ chip_avatar_url: dataUrl });
}

/** Remove b_ark_status and every chip_* key — used when an account is removed. */
export async function clearAll(): Promise<void> {
  await chrome.storage.local.remove(['b_ark_status', 'auto_resume_at', ...CHIP_KEYS]);
}
