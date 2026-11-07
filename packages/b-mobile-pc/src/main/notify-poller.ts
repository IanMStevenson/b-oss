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
import type {
  AccountStatus,
  CheckResult,
  NotifyAccountConfig,
  NotifyPayload,
  NotifyStatus,
} from '../shared/notify.js';
import { describeFailure } from './notify-failure.js';

export const POLL_INTERVAL_MS = 5 * 60_000;
/** A failing account is retried every 2, 4, ... ticks up to this many, then stays there. */
export const MAX_BACKOFF_TICKS = 6;
/** "Check now" will not hit the same account more often than this (the API budget is shared). */
export const MIN_CHECK_GAP_MS = 10_000;

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
  /** Writes one line to the app log (b-oss#677). Never given a token or response content. */
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

const STREAM_NAMES = ['comments', 'notifications'] as const;

const describeStreams = (a: AccountState): string =>
  STREAM_NAMES.filter((n) => a.streams[n]).join(',') || 'none';

export class NotifyPoller {
  private state: StateFile = { v: 1, accounts: {} };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private polling: Promise<void> = Promise.resolve();
  /** Ticks left to skip per account after failures; in memory only. */
  private skip = new Map<string, number>();
  private failures = new Map<string, number>();
  private rateLimited = new Set<string>();
  /** What the settings screen shows; in memory only (a restart starts with "not checked yet"). */
  private results = new Map<string, CheckResult>();
  private lastAttemptAt = new Map<string, number>();
  private checking = new Set<string>();
  private nextTickAt: number | null = null;
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
    this.deps.log(
      `poller started: interval=${Math.round(this.intervalMs / 1000)}s accounts=${this.describeAccounts()}`,
    );
    this.emitActive();
    this.schedule(0);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.nextTickAt = null;
    this.deps.log('poller stopped');
  }

  private describeAccounts(): string {
    const ids = Object.keys(this.state.accounts);
    return ids.length === 0
      ? '[]'
      : `[${ids.map((id) => `${id}(${describeStreams(this.state.accounts[id])})`).join(' ')}]`;
  }

  watchedCount(): number {
    return Object.keys(this.state.accounts).length;
  }

  /** True while there is at least one account to watch: the shell stays in the tray for it. */
  hasAccounts(): boolean {
    return Object.keys(this.state.accounts).length > 0;
  }

  onActiveChange(listener: (active: boolean) => void): void {
    this.activeListener = listener;
  }

  /** Per-account status for the settings screen (b-oss#673). */
  getStatus(): NotifyStatus {
    const accounts: AccountStatus[] = Object.entries(this.state.accounts).map(([id, a]) => ({
      accountId: id,
      lastCheckedAt: a.lastPolledAt,
      nextCheckAt:
        this.nextTickAt === null || a.reauthShown || !this.running
          ? null
          : this.nextTickAt + (this.skip.get(id) ?? 0) * this.intervalMs,
      checking: this.checking.has(id),
      result: a.reauthShown
        ? {
            kind: 'sign-in-needed',
            text: 'Sign-in needed: Blipfoto rejected the saved sign-in',
          }
        : (this.results.get(id) ?? null),
    }));
    return { accounts };
  }

  /** "Check now": polls every watched account straight away. Backoff after failures is skipped,
   * but not for an account Blipfoto has rate limited, nor for one checked in the last few seconds.
   * Unlike the timer it also tries when the system says it is offline, so a wrong "offline" shows
   * up as a success in the log. The regular timer restarts from now. */
  async checkNow(): Promise<NotifyStatus> {
    if (this.running) {
      this.deps.log('check now requested');
      this.polling = this.polling.then(() => this.tick(true)).catch(() => undefined);
      await this.polling;
      if (this.timer !== null) this.schedule(this.intervalMs);
    }
    return this.getStatus();
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
    for (const map of [this.skip, this.failures, this.results, this.lastAttemptAt]) {
      for (const id of [...map.keys()]) if (!(id in next)) map.delete(id);
    }
    for (const id of [...this.rateLimited]) if (!(id in next)) this.rateLimited.delete(id);
    this.deps.log(`configured: accounts=${this.describeAccounts()}`);
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
    this.nextTickAt = Date.now() + delayMs;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.nextTickAt = null;
      // Serialised: a tick requested by configure() never overlaps one already running.
      this.polling = this.polling.then(() => this.tick(false)).catch(() => undefined);
      // A tick requested meanwhile (configure) keeps its earlier timer.
      void this.polling.then(() => {
        if (this.timer === null) this.schedule(this.intervalMs);
      });
    }, delayMs);
  }

  private record(accountId: string, result: CheckResult): void {
    this.results.set(accountId, result);
  }

  private async tick(forced: boolean): Promise<void> {
    const ids = Object.keys(this.state.accounts);
    if (ids.length === 0) return;
    if (!this.deps.isOnline()) {
      if (!forced) {
        this.deps.log(
          `poll skipped: the system reports no network connection (${ids.length} account(s))`,
        );
        for (const id of ids) {
          this.record(id, { kind: 'offline', text: 'Waiting for a network connection' });
        }
        return;
      }
      this.deps.log('check now: the system reports no network connection; trying anyway');
    }
    for (const accountId of ids) {
      if (!this.running) return;
      if (forced) {
        if (this.rateLimited.has(accountId)) {
          this.deps.log(`check now skipped for ${accountId}: rate limited, waiting for its retry`);
          continue;
        }
        const last = this.lastAttemptAt.get(accountId) ?? 0;
        // Never longer than half the interval, so a fast test interval still lets it through.
        if (Date.now() - last < Math.min(MIN_CHECK_GAP_MS, this.intervalMs / 2)) {
          this.deps.log(`check now skipped for ${accountId}: checked a moment ago`);
          continue;
        }
        this.skip.delete(accountId);
      } else {
        const skip = this.skip.get(accountId) ?? 0;
        if (skip > 0) {
          this.skip.set(accountId, skip - 1);
          this.deps.log(
            `poll skipped for ${accountId}: backing off after errors (${skip} tick(s) left)`,
          );
          continue;
        }
      }
      this.checking.add(accountId);
      this.lastAttemptAt.set(accountId, Date.now());
      try {
        await this.pollOne(accountId);
        this.failures.delete(accountId);
        this.rateLimited.delete(accountId);
      } catch (err) {
        const failure = describeFailure(err);
        const n = (this.failures.get(accountId) ?? 0) + 1;
        this.failures.set(accountId, n);
        this.skip.set(accountId, Math.min(2 ** n - 1, MAX_BACKOFF_TICKS));
        if (failure.result.kind === 'rate-limited') this.rateLimited.add(accountId);
        else this.rateLimited.delete(accountId);
        const current = this.state.accounts[accountId];
        if (current) current.lastPolledAt = Date.now();
        this.record(accountId, failure.result);
        // Never the token, never the response body.
        this.deps.log(
          `poll failed account=${accountId} failures=${n} next-retry-ticks=${this.skip.get(accountId) ?? 0}: ${failure.logText}`,
        );
      } finally {
        this.checking.delete(accountId);
      }
    }
  }

  private async pollOne(accountId: string): Promise<void> {
    const account = this.state.accounts[accountId];
    if (!account) return;
    if (account.reauthShown) {
      this.deps.log(`poll skipped for ${accountId}: waiting for the user to sign in again`);
      return;
    }
    const t0 = Date.now();
    const token = await this.deps.getToken(accountId);
    const keystoreMs = Date.now() - t0;
    // Signed out in the meantime: the app will drop the account at its next configure.
    if (token === null) {
      this.record(accountId, { kind: 'no-token', text: 'No saved sign-in for this account' });
      this.deps.log(
        `poll skipped for ${accountId}: no saved sign-in in the secure store (read ${keystoreMs} ms)`,
      );
      return;
    }

    let totals: UnreadTotals;
    const t1 = Date.now();
    try {
      totals = await this.deps.fetchTotals(token);
    } catch (err) {
      if (err instanceof TokenInvalidError) {
        this.deps.log(
          `poll account=${accountId}: Blipfoto rejected the sign-in; showing sign-in-again`,
        );
        await this.reauthRequired(accountId);
        this.record(accountId, describeFailure(err).result);
        return;
      }
      throw err;
    }
    const timing = `secure-store=${keystoreMs}ms request=${Date.now() - t1}ms`;

    // The account may have been removed or edited while the request was in flight.
    const current = this.state.accounts[accountId];
    if (!current) return;
    current.lastPolledAt = Date.now();

    if (current.seen === null) {
      current.seen = { comments: totals.comments, notifications: totals.notifications };
      this.record(accountId, {
        kind: 'baseline',
        text: 'Starting counts recorded; you will be told about anything new from now on',
        newItems: 0,
      });
      this.deps.log(
        `poll baseline account=${accountId} comments=${totals.comments} notifications=${totals.notifications} (recorded, nothing announced) ${timing}`,
      );
      await this.save();
      return;
    }

    const lastSeen = current.seen;
    this.deps.log(
      `poll ok account=${accountId} comments=${totals.comments} (was ${lastSeen.comments}) notifications=${totals.notifications} (was ${lastSeen.notifications}) ${timing}`,
    );
    const decision = decideNotifications({ totals, lastSeen, streams: current.streams });
    let newItems = 0;
    for (const stream of STREAM_NAMES) {
      const delta = totals[stream] - lastSeen[stream];
      if (delta > 0) newItems += delta;
      if (delta > 0 && !current.streams[stream]) {
        this.deps.log(
          `decision account=${accountId} stream=${stream} new=${delta}: suppressed, stream is switched off`,
        );
      } else if (delta < 0) {
        this.deps.log(
          `decision account=${accountId} stream=${stream}: count fell by ${-delta}, nothing to show`,
        );
      }
    }
    const result = await settle(decision, lastSeen, async (n: Notify) => {
      this.deps.log(`decision account=${accountId} stream=${n.stream} new=${n.count}: showing`);
      try {
        await this.deps.show({
          payload: { kind: 'activity', stream: n.stream, accountId },
          count: n.count,
        });
      } catch (err) {
        this.deps.log(
          `decision account=${accountId} stream=${n.stream}: not shown (${err instanceof Error ? err.message : 'error'}); will retry next poll`,
        );
        throw err;
      }
    });
    current.seen = result.nextSeen;
    const delivered = result.delivered.length;
    this.record(accountId, {
      kind: 'ok',
      text: newItems === 0 ? 'Nothing new' : `${newItems} new, ${delivered} notification(s) shown`,
      newItems,
    });
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
