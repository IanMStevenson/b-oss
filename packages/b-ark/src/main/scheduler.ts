// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { AccountConfig } from '@b-oss/b-ark-ui';

const MAX_TIMEOUT_MS = 2_147_483_647;

export class BackupScheduler {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly onRun: (accountId: string) => void) {}

  schedule(account: AccountConfig): void {
    this.cancel(account.id);
    if (!(account.schedule.enabled ?? true)) return;

    const nextRun = new Date(account.schedule.next_run).getTime();
    const now = Date.now();
    const delay = nextRun - now;

    if (delay <= 0) {
      setImmediate(() => this.onRun(account.id));
      return;
    }

    const timer = setTimeout(
      () => {
        this.timers.delete(account.id);
        this.onRun(account.id);
      },
      Math.min(delay, MAX_TIMEOUT_MS),
    );
    this.timers.set(account.id, timer);
  }

  cancel(accountId: string): void {
    const timer = this.timers.get(accountId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.timers.delete(accountId);
    }
  }

  cancelAll(): void {
    for (const id of [...this.timers.keys()]) this.cancel(id);
  }
}

export function computeNextRun(hour: number, interval: 'daily' | 'weekly' | 'monthly'): string {
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
