// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The upload queue's runner (§9) — a plain module, not a React component, since push/deep-link/
// reminder machinery all need to read and write the same state from outside the component tree
// (§6). One item at a time, serial, so progress reporting stays honest and several large uploads
// never compete on one phone connection.
//
// Retry policy (§9): only `transport` outcomes retry, with capped exponential backoff; every
// other outcome from mapApiError moves straight to `failed` with its message. On success, cancel-
// and-reschedule that account's reminder for today (§12's cancellation-based suppression) and
// delete the copied file. The "process was killed mid-upload" case is handled by
// startUploadQueueRunner()'s own recovery sweep (§9's "honest limitation": a Capacitor app can't
// upload while its process is dead — an item stuck `uploading` from a prior run is reset to
// `waiting` and resumed, not left stranded).

import { getClientForAccount } from '../data/client.js';
import { mapApiError } from '../data/errors.js';
import { readQueuedFileAsSource, deleteQueuedFile } from '../platform/upload.js';
import { useUploadQueueStore } from '../state/uploadQueueStore.js';
import type { UploadQueueItem, PublishQueueFields } from '../state/uploadQueueStore.js';
import { handleForcedLogout } from './accountsFlow.js';
import { onEntryPublished } from './reminderFlow.js';
import type { ApiErrorOutcome } from '../data/errors.js';

/** Every non-transport, non-forced-logout outcome moves straight to `failed` (§9) — this just
 * picks the right message shape per outcome.kind, since `validation`'s copyKey isn't a message
 * yet (data/errors.ts: no copy-deck exists until TODO F/G land). */
function failureMessage(outcome: ApiErrorOutcome): string {
  switch (outcome.kind) {
    case 'message':
    case 'rate-limited':
    case 'upgrade-prompt':
      return outcome.message;
    case 'validation':
      return 'Please check the entry details and try again.';
    case 'transport':
    case 'forced-logout':
      // Handled by their own branches above — never reaches here.
      return 'Something went wrong. Please try again.';
  }
}

/** 5s, 15s, 45s, 2m, 5m, capped — gives up after this many attempts (§9). */
const BACKOFF_MS = [5_000, 15_000, 45_000, 120_000, 300_000];
const MAX_ATTEMPTS = 6;

export function nextBackoffMs(attempts: number): number {
  const index = Math.min(attempts, BACKOFF_MS.length) - 1;
  return BACKOFF_MS[Math.max(0, index)];
}

let draining = false;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;

/** Call once at app launch. Resets any item stuck `uploading` from a killed process, then starts
 * draining. Idempotent-enough to call more than once (e.g. a future app-resume hook) since
 * draining is guarded. */
export function startUploadQueueRunner(): void {
  const store = useUploadQueueStore.getState();
  for (const item of store.items) {
    if (item.status === 'uploading') {
      store.updateItem(item.id, { status: 'waiting', nextAttemptAt: null });
    }
  }
  wakeUploadQueueRunner();
}

/** Call after enqueueing a new item, or whenever something might make a waiting item runnable
 * again (e.g. connectivity returning — not wired to a connectivity listener yet, matching §9's
 * scope: only enqueue and launch-recovery trigger a wake for now). */
export function wakeUploadQueueRunner(): void {
  void drain();
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    for (;;) {
      const next = pickNextItem();
      if (!next) break;
      await processItem(next);
    }
  } finally {
    draining = false;
  }
  scheduleWakeForFutureRetry();
}

function pickNextItem(): UploadQueueItem | undefined {
  const now = Date.now();
  return useUploadQueueStore
    .getState()
    .items.find(
      (i) => i.status === 'waiting' && (i.nextAttemptAt == null || i.nextAttemptAt <= now),
    );
}

function scheduleWakeForFutureRetry(): void {
  if (wakeTimer) {
    clearTimeout(wakeTimer);
    wakeTimer = null;
  }
  const now = Date.now();
  const upcoming = useUploadQueueStore
    .getState()
    .items.filter((i) => i.status === 'waiting' && i.nextAttemptAt != null && i.nextAttemptAt > now)
    .map((i) => i.nextAttemptAt as number);
  if (upcoming.length === 0) return;
  const soonest = Math.min(...upcoming);
  wakeTimer = setTimeout(() => void drain(), Math.max(0, soonest - now));
}

async function processItem(item: UploadQueueItem): Promise<void> {
  const store = useUploadQueueStore.getState();
  store.updateItem(item.id, { status: 'uploading', error: null });

  try {
    const client = await getClientForAccount(item.accountId);
    const image =
      item.filePath && item.fileMimeType
        ? await readQueuedFileAsSource(item.filePath, item.fileMimeType)
        : undefined;

    const entryId =
      item.kind === 'publish'
        ? (await client.publishEntry({ ...(item.fields as PublishQueueFields), image: image! }))
            .entry.entry_id_str
        : (
            await client.updateEntry({
              entryId: item.entryId!,
              ...item.fields,
              image,
            })
          ).entry.entry_id_str;

    useUploadQueueStore.getState().updateItem(item.id, {
      status: 'uploaded',
      resultEntryId: entryId,
      error: null,
    });
    if (item.filePath) await deleteQueuedFile(item.filePath);
    onEntryPublished(item.accountId);
  } catch (err) {
    handleFailure(item, err);
  }
}

function handleFailure(item: UploadQueueItem, err: unknown): void {
  const outcome = mapApiError(err);

  if (outcome.kind === 'transport') {
    const attempts = item.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      useUploadQueueStore.getState().updateItem(item.id, {
        status: 'failed',
        attempts,
        error: 'Could not connect after several attempts. Check your connection and try again.',
      });
      return;
    }
    useUploadQueueStore.getState().updateItem(item.id, {
      status: 'waiting',
      attempts,
      nextAttemptAt: Date.now() + nextBackoffMs(attempts),
    });
    return;
  }

  if (outcome.kind === 'forced-logout') {
    handleForcedLogout(item.accountId, 'app');
    useUploadQueueStore.getState().updateItem(item.id, {
      status: 'failed',
      error: 'Signed out — please sign in again and retry.',
    });
    return;
  }

  useUploadQueueStore
    .getState()
    .updateItem(item.id, { status: 'failed', error: failureMessage(outcome) });
}
