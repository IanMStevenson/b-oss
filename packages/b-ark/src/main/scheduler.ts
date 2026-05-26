// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { PortableSchedule, ScheduleInterval } from '@b-oss/b-ark-ui';

const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Single-timer scheduler. When the timer fires, runs every account
 * sequentially in `account_order`, then advances the shared `next_run` and
 * rearms. If a fire arrives while a sequential pass is already running,
 * exactly one re-pass is queued (further fires while busy are coalesced).
 *
 * Manual single-account runs do not advance the shared schedule.
 */
export class BackupScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private requeue = false;

  constructor(
    private readonly getSchedule: () => PortableSchedule,
    private readonly getAccountOrder: () => string[],
    private readonly runOne: (id: string) => Promise<void>,
    private readonly advanceNextRun: () => Promise<void>,
  ) {}

  /** Cancel any pending timer and rearm from the current shared schedule. */
  rearm(): void {
    this.cancel();
    const sch = this.getSchedule();
    if (!sch.enabled) return;
    const delay = new Date(sch.next_run).getTime() - Date.now();
    if (delay <= 0) {
      // Fire on the next macrotask so callers can finish their setup first.
      setImmediate(() => void this.fire());
      return;
    }
    this.timer = setTimeout(
      () => {
        this.timer = null;
        void this.fire();
      },
      Math.min(delay, MAX_TIMEOUT_MS),
    );
  }

  /** Cancel the pending timer (e.g. on app shutdown). */
  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async fire(): Promise<void> {
    if (this.running) {
      this.requeue = true;
      return;
    }
    this.running = true;
    try {
      for (const id of this.getAccountOrder()) {
        try {
          await this.runOne(id);
        } catch {
          // runOne already records error_message / rag_state via saveAccount
        }
      }
      await this.advanceNextRun();
    } finally {
      this.running = false;
    }
    this.rearm();
    if (this.requeue) {
      this.requeue = false;
      void this.fire();
    }
  }
}

export function computeNextRun(hour: number, interval: ScheduleInterval): string {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);

  if (next <= now) {
    if (interval === 'daily') next.setDate(next.getDate() + 1);
    else if (interval === 'weekly') next.setDate(next.getDate() + 7);
    else next.setMonth(next.getMonth() + 1);
  }

  return next.toISOString();
}
