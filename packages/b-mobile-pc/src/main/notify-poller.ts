// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Desktop notifications by polling (b-oss#610). One timer for every watched account: each tick
// reads the account's single app token from the secure store (never cached), asks for the two
// unread counts (counts only; anything that returns comment or notification content would mark it
// read), applies the shared count-diff rule and hands the result to `show`. Everything the
// poller touches is injected, so it is tested with fake timers and no Electron.
//
// State (what was last seen per account, and the settings the app last sent) is written to one
// file so polling carries on with no window open, and a restart neither repeats nor misses a
// notification. The first poll of an account only records the counts: it does not announce what
// was already there (the shared service seeds its rows the same way).

import {
  decideNotifications,
  settle,
  TokenInvalidError,
  type Notify,
  type SeenTotals,
  type UnreadTotals,
} from '@b-oss/b-notify-core';
import type { NotifyAccountConfig, NotifyPayload } from '../shared/notify.js';

export const POLL_INTERVAL_MS = 5 * 60_000;
/** A failing account is retried every 2, 4, ... ticks up to this many, then stays there. */
export const MAX_BACKOFF_TICKS = 6;

/** A notification to show: the payload that comes back on a click, plus how many items. */
export interface ToShow {
  payload: NotifyPayload;
  /** New items for an `activity` payload. */
  count: number;
}

export interface PollerDeps {
  readFile(): Promise<string | null>;
  /** Must replace the file atomically. */
  writeFile(contents: string): Promise<void>;
  getToken(accountId: string): Promise<string | null>;
  fetchTotals(token: string): Promise<UnreadTotals>;
  /** Shows the OS notification. Rejects when it could not be shown (so the total is kept and the
   * next poll tries again). */
  show(item: ToShow): Promise<void>;
  isOnline(): boolean;
  log(message: string): void;
  intervalMs?: number;
}

interface AccountState {
  streams: { comments: boolean; notifications: boolean };
  /** null until the first successful poll has recorded the starting counts. */
  seen: SeenTotals | null;
  lastPolledAt: number | null;
  /** The one "sign in again" notification has been shown; polling this account has stopped. */
  reauthShown: boolean;
}

interface StateFile {
  v: 1;
  accounts: Record<string, AccountState>;
}

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/** Tolerant: a damaged or unrecognised file means "start fresh", never a crash. */
export function parseState(raw: string | null): StateFile {
  const empty: StateFile = { v: 1, accounts: {} };
  if (raw === null) return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (typeof parsed !== 'object' || parsed === null) return empty;
  const file = parsed as { v?: unknown; accounts?: unknown };
  if (file.v !== 1 || typeof file.accounts !== 'object' || file.accounts === null) return empty;
  const accounts: Record<string, AccountState> = {};
  for (const [id, value] of Object.entries(file.accounts)) {
    if (typeof value !== 'object' || value === null) continue;
    const a = value as Record<string, unknown>;
    const streams = a.streams as Record<string, unknown> | undefined;
    if (!streams || typeof streams.comments !== 'boolean') continue;
    if (typeof streams.notifications !== 'boolean') continue;
    const seen = a.seen as Record<string, unknown> | null | undefined;
    accounts[id] = {
      streams: { comments: streams.comments, notifications: streams.notifications },
      seen:
        seen && isCount(seen.comments) && isCount(seen.notifications)
          ? { comments: seen.comments, notifications: seen.notifications }
          : null,
      lastPolledAt: isCount(a.lastPolledAt) ? a.lastPolledAt : null,
      reauthShown: a.reauthShown === true,
    };
  }
  return { v: 1, accounts };
}

export class NotifyPoller {
  private state: StateFile = { v: 1, accounts: {} };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private polling: Promise<void> = Promise.resolve();
  /** Ticks left to skip per account after failures; in memory only. */
  private skip = new Map<string, number>();
  private failures = new Map<string, number>();
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly intervalMs: number;
  private activeListener: ((active: boolean) => void) | null = null;

  constructor(private readonly deps: PollerDeps) {
    this.intervalMs = deps.intervalMs ?? POLL_INTERVAL_MS;
  }

  /** Loads the saved state and starts the timer. Polls straight away so a restart after a long
   * time away does not wait a full interval. */
  async start(): Promise<void> {
    this.state = parseState(await this.deps.readFile().catch(() => null));
    this.running = true;
    this.emitActive();
    this.schedule(0);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** True while there is at least one account to watch: the shell stays in the tray for it. */
  hasAccounts(): boolean {
    return Object.keys(this.state.accounts).length > 0;
  }

  onActiveChange(listener: (active: boolean) => void): void {
    this.activeListener = listener;
  }

  /** Replaces the watched set. New accounts are polled at once (recording their starting counts);
   * changed streams keep their counts; removed accounts are forgotten, including a pending
   * "sign in again", so a fresh sign-in starts clean. */
  async configure(accounts: readonly NotifyAccountConfig[]): Promise<void> {
    const before = this.hasAccounts();
    const next: Record<string, AccountState> = {};
    for (const { accountId, streams } of accounts) {
      const existing = this.state.accounts[accountId];
      next[accountId] = existing
        ? { ...existing, streams: { ...streams } }
        : { streams: { ...streams }, seen: null, lastPolledAt: null, reauthShown: false };
    }
    this.state = { v: 1, accounts: next };
    for (const id of [...this.skip.keys()]) if (!(id in next)) this.skip.delete(id);
    for (const id of [...this.failures.keys()]) if (!(id in next)) this.failures.delete(id);
    await this.save();
    if (before !== this.hasAccounts()) this.emitActive();
    if (this.running && Object.values(next).some((a) => a.seen === null)) this.schedule(0);
  }

  private emitActive(): void {
    this.activeListener?.(this.hasAccounts());
  }

  private schedule(delayMs: number): void {
    if (!this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      // Serialised: a tick requested by configure() never overlaps one already running.
      this.polling = this.polling.then(() => this.tick()).catch(() => undefined);
      // A tick requested meanwhile (configure) keeps its earlier timer.
      void this.polling.then(() => {
        if (this.timer === null) this.schedule(this.intervalMs);
      });
    }, delayMs);
  }

  private async tick(): Promise<void> {
    if (!this.deps.isOnline()) return;
    for (const accountId of Object.keys(this.state.accounts)) {
      if (!this.running) return;
      const skip = this.skip.get(accountId) ?? 0;
      if (skip > 0) {
        this.skip.set(accountId, skip - 1);
        continue;
      }
      try {
        await this.pollOne(accountId);
        this.failures.delete(accountId);
      } catch (err) {
        const n = (this.failures.get(accountId) ?? 0) + 1;
        this.failures.set(accountId, n);
        this.skip.set(accountId, Math.min(2 ** n - 1, MAX_BACKOFF_TICKS));
        // Never the token, never the response body.
        this.deps.log(
          `notify poll failed for ${accountId}: ${err instanceof Error ? err.name : 'error'}`,
        );
      }
    }
  }

  private async pollOne(accountId: string): Promise<void> {
    const account = this.state.accounts[accountId];
    if (!account || account.reauthShown) return;
    const token = await this.deps.getToken(accountId);
    // Signed out in the meantime: the app will drop the account at its next configure.
    if (token === null) return;

    let totals: UnreadTotals;
    try {
      totals = await this.deps.fetchTotals(token);
    } catch (err) {
      if (err instanceof TokenInvalidError) {
        await this.reauthRequired(accountId);
        return;
      }
      throw err;
    }

    // The account may have been removed or edited while the request was in flight.
    const current = this.state.accounts[accountId];
    if (!current) return;
    current.lastPolledAt = Date.now();

    if (current.seen === null) {
      current.seen = { comments: totals.comments, notifications: totals.notifications };
      await this.save();
      return;
    }

    const lastSeen = current.seen;
    const decision = decideNotifications({ totals, lastSeen, streams: current.streams });
    const result = await settle(decision, lastSeen, (n: Notify) =>
      this.deps.show({
        payload: { kind: 'activity', stream: n.stream, accountId },
        count: n.count,
      }),
    );
    current.seen = result.nextSeen;
    await this.save();
    if (result.error) throw result.error;
  }

  /** Exactly one "sign in again" notification; after it, this account is not polled until the app
   * has handled it (removing it from the watched set) and added it back. If showing fails, the
   * flag stays off and the next poll tries again. */
  private async reauthRequired(accountId: string): Promise<void> {
    await this.deps.show({ payload: { kind: 'reauth-required', accountId }, count: 0 });
    // Looked up again: configure() may have replaced the state while the notification was shown.
    const current = this.state.accounts[accountId];
    if (!current) return;
    current.reauthShown = true;
    await this.save();
  }

  private save(): Promise<void> {
    const contents = JSON.stringify(this.state);
    const run = this.writeQueue.then(() => this.deps.writeFile(contents));
    this.writeQueue = run.catch(() => undefined);
    return run.catch((err: unknown) => {
      this.deps.log(`notify state not saved: ${err instanceof Error ? err.name : 'error'}`);
    });
  }
}
