// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The daily "post your blip" reminder on desktop (b-oss#894). On Android the OS schedules it; here
// the main process does, because it keeps running in the tray with the window closed. The web app
// owns the setting and tells us the full picture per account (set / clear / skip today after a
// publish); we keep it in a small file so a start at login can arm the timers before the page has
// loaded. Pure apart from the injected clock, timers, file and toast, so it is unit-tested.
//
// Behaviour: one toast at the chosen local time each day, none for a day the account already
// published on. A time that passed while the app was off or the machine asleep is caught up when it
// comes back, the same day only (never a day late); each day's toast is remembered so it shows once.

import type { ReminderTime } from '../shared/reminders.js';

/** setTimeout's longest delay is 2^31-1 ms; a day is far below it, this is only a guard. */
const MAX_DELAY_MS = 2 ** 31 - 1;

/** Local calendar day as YYYY-MM-DD. */
export function localDay(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The first time at `time` (local) strictly after `from`, on a day later than `skipDay` (a
 * YYYY-MM-DD string, or null). Built from calendar fields, so it stays right across a DST change.
 */
export function nextOccurrence(time: ReminderTime, from: Date, skipDay: string | null): Date {
  const candidate = new Date(
    from.getFullYear(),
    from.getMonth(),
    from.getDate(),
    time.hour,
    time.minute,
    0,
    0,
  );
  while (
    candidate.getTime() <= from.getTime() ||
    (skipDay !== null && localDay(candidate) <= skipDay)
  ) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

interface Entry extends ReminderTime {
  /** A day (YYYY-MM-DD) the account already published on: no reminder on or before it. */
  skipDay: string | null;
  /** The last day (YYYY-MM-DD) the toast was shown, or set up too late to be due: once per day. */
  shownDay: string | null;
}

/** The latest day that is already dealt with (YYYY-MM-DD strings compare in date order). */
function doneDay(entry: Entry): string | null {
  if (entry.skipDay === null) return entry.shownDay;
  if (entry.shownDay === null) return entry.skipDay;
  return entry.skipDay > entry.shownDay ? entry.skipDay : entry.shownDay;
}

/** Today's time has come and today is not yet dealt with: the toast is due now (or was, while off). */
function isDue(entry: Entry, now: Date): boolean {
  const today = localDay(now);
  const done = doneDay(entry);
  if (done !== null && done >= today) return false;
  const todayAt = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    entry.hour,
    entry.minute,
  );
  return todayAt.getTime() <= now.getTime();
}

export interface ReminderDeps {
  readFile(): Promise<string | null>;
  /** Must replace the file atomically. */
  writeFile(contents: string): Promise<void>;
  now(): Date;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Shows the reminder toast. May reject; it is logged and the day is not retried. */
  show(accountId: string): Promise<void>;
  log(message: string): void;
}

function parseFile(text: string | null): Record<string, Entry> {
  if (!text) return {};
  try {
    const raw = (JSON.parse(text) as { reminders?: unknown }).reminders;
    if (typeof raw !== 'object' || raw === null) return {};
    const out: Record<string, Entry> = {};
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      const v = value as {
        hour?: unknown;
        minute?: unknown;
        skipDay?: unknown;
        shownDay?: unknown;
      } | null;
      if (
        v &&
        Number.isInteger(v.hour) &&
        Number.isInteger(v.minute) &&
        (v.hour as number) >= 0 &&
        (v.hour as number) <= 23 &&
        (v.minute as number) >= 0 &&
        (v.minute as number) <= 59
      ) {
        out[id] = {
          hour: v.hour as number,
          minute: v.minute as number,
          skipDay: typeof v.skipDay === 'string' ? v.skipDay : null,
          shownDay: typeof v.shownDay === 'string' ? v.shownDay : null,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export class ReminderScheduler {
  private entries: Record<string, Entry> = {};
  private timer: unknown = null;
  private changeListener: ((active: boolean) => void) | null = null;
  private writes: Promise<void> = Promise.resolve();

  constructor(private readonly deps: ReminderDeps) {}

  async start(): Promise<void> {
    this.entries = parseFile(await this.deps.readFile());
    this.deps.log(`reminders: loaded ${this.count()} account(s)`);
    this.arm();
  }

  stop(): void {
    this.disarm();
  }

  count(): number {
    return Object.keys(this.entries).length;
  }

  /** True while any reminder is on: the shell stays in the tray and starts at sign-in for it. */
  hasReminders(): boolean {
    return this.count() > 0;
  }

  onActiveChange(listener: (active: boolean) => void): void {
    this.changeListener = listener;
  }

  /**
   * The full set of reminders the web app wants (every time it changes, and at start-up). An account
   * whose time is unchanged keeps its "published today" skip; a new or re-timed one counts from now.
   */
  configure(reminders: readonly { accountId: string; time: ReminderTime }[]): void {
    const before = this.hasReminders();
    const now = this.deps.now();
    const next: Record<string, Entry> = {};
    for (const { accountId, time } of reminders) {
      const old = this.entries[accountId];
      if (old && old.hour === time.hour && old.minute === time.minute) {
        next[accountId] = old;
        continue;
      }
      // New or re-timed: a time that has already passed today is not owed (switching a 20:00
      // reminder on at 21:00 must not fire at once); only a later day's time counts.
      const entry: Entry = { hour: time.hour, minute: time.minute, skipDay: null, shownDay: null };
      if (isDue(entry, now)) entry.shownDay = localDay(now);
      next[accountId] = entry;
    }
    this.entries = next;
    this.changed(before);
  }

  /** A publish or edit went through: no reminder for today. A no-op for an account without one. */
  skipToday(accountId: string): void {
    const entry = this.entries[accountId];
    if (!entry) return;
    entry.skipDay = localDay(this.deps.now());
    this.changed(this.hasReminders());
  }

  /** The clock may have jumped (sleep, resume, a time change): work the next time out again. */
  resync(): void {
    this.arm();
  }

  private changed(before: boolean): void {
    this.persist();
    this.arm();
    if (before !== this.hasReminders()) this.changeListener?.(this.hasReminders());
  }

  private persist(): void {
    const contents = JSON.stringify({ version: 1, reminders: this.entries });
    this.writes = this.writes
      .then(() => this.deps.writeFile(contents))
      .catch((err: unknown) => {
        this.deps.log(`reminders: could not save: ${err instanceof Error ? err.message : 'error'}`);
      });
  }

  private disarm(): void {
    if (this.timer !== null) this.deps.clearTimer(this.timer);
    this.timer = null;
  }

  private arm(): void {
    this.disarm();
    const ids = Object.keys(this.entries);
    if (ids.length === 0) return;
    const now = this.deps.now();
    const next = Math.min(
      ...ids.map((id) => {
        const entry = this.entries[id];
        // Due now (the time passed while we were off or asleep): at once, once.
        if (isDue(entry, now)) return now.getTime();
        return nextOccurrence(entry, now, doneDay(entry)).getTime();
      }),
    );
    const delay = Math.min(Math.max(next - now.getTime(), 0), MAX_DELAY_MS);
    this.timer = this.deps.setTimer(() => void this.fire(), delay);
  }

  private async fire(): Promise<void> {
    this.timer = null;
    const now = this.deps.now();
    const dueIds = Object.keys(this.entries).filter((id) => isDue(this.entries[id], now));
    // Marked and re-armed before the toasts, so a slow or failing one neither repeats nor stops
    // tomorrow's.
    for (const id of dueIds) this.entries[id].shownDay = localDay(now);
    if (dueIds.length > 0) this.persist();
    this.arm();
    for (const id of dueIds) {
      try {
        await this.deps.show(id);
        this.deps.log(`reminders: shown for ${id}`);
      } catch (err) {
        this.deps.log(
          `reminders: could not show for ${id}: ${err instanceof Error ? err.message : 'error'}`,
        );
      }
    }
  }
}
