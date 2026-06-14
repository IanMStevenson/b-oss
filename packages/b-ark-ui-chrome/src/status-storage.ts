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
//   AMBER = working, or incomplete-but-not-errored (resume in progress, cancelled).
//   GREEN = a run reached `completed`.

import type { BackupErrorPayload } from '@b-oss/backup-engine';

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
}

// ── Low-level access to b_ark_status ──────────────────────────────────────────

export async function readStatus(): Promise<Partial<ChromeStatus>> {
  const r = await chrome.storage.local.get('b_ark_status');
  return (r['b_ark_status'] ?? {}) as Partial<ChromeStatus>;
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
      return 'error';
  }
}

// ── State transitions (write b_ark_status + chip_* together) ──────────────────

/** A run started / resumed — the first successful network transaction proves it works. */
export async function setWorking(): Promise<void> {
  await patchStatus({ rag_state: 'amber', error_message: null });
  await chrome.storage.local.set({
    chip_rag: 'amber',
    chip_error_kind: null,
    chip_progress: null,
    chip_amber_reason: null,
  });
}

/** A run finished cleanly. */
export async function setCompleted(nowIso: string, totalArchived: number): Promise<void> {
  await patchStatus({
    last_backup_at: nowIso,
    total_archived: totalArchived,
    rag_state: 'green',
    error_message: null,
  });
  await chrome.storage.local.set({
    chip_rag: 'green',
    chip_progress: null,
    chip_last_backup_at: nowIso,
    chip_error_kind: null,
  });
}

/** A run was cancelled — leaves an incomplete (amber), non-error state. */
export async function setCancelledIncomplete(): Promise<void> {
  await patchStatus({ rag_state: 'amber', error_message: null });
  await chrome.storage.local.set({
    chip_rag: 'amber',
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
export async function setFailed(kind: BackupErrorPayload['kind'], message: string): Promise<void> {
  await patchStatus({ rag_state: 'red', error_message: message });
  await chrome.storage.local.set({
    chip_rag: 'red',
    chip_error_kind: chipKindFor(kind),
    chip_progress: null,
  });
}

/** Remediation succeeded (reauthorise / folder grant) — clear red to amber. */
export async function clearError(): Promise<void> {
  await patchStatus({ rag_state: 'amber', error_message: null });
  await chrome.storage.local.set({
    chip_rag: 'amber',
    chip_error_kind: null,
  });
}
