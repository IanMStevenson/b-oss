// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// What crosses the bridge for the daily reminder (b-oss#894). The web app owns the setting (on/off
// and time per account); the main process only runs the clock, because that is the part that must
// keep going with the window hidden in the tray.

export interface ReminderTime {
  hour: number;
  minute: number;
}

const MAX_ID_LENGTH = 128;
const MAX_REMINDERS = 32;

/** The renderer is untrusted input: accept only the exact shape. */
export function parseReminderAccountId(input: unknown): string {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_ID_LENGTH) {
    throw new TypeError('Invalid reminder account id');
  }
  return input;
}

export function parseReminderTime(input: unknown): ReminderTime {
  if (typeof input !== 'object' || input === null) throw new TypeError('Invalid reminder time');
  const { hour, minute } = input as { hour?: unknown; minute?: unknown };
  if (
    typeof hour !== 'number' ||
    typeof minute !== 'number' ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    throw new TypeError('Invalid reminder time');
  }
  return { hour, minute };
}

export interface ReminderConfig {
  accountId: string;
  time: ReminderTime;
}

/** The full set of reminders; a duplicate account keeps the first. */
export function parseReminderConfigs(input: unknown): ReminderConfig[] {
  if (!Array.isArray(input) || input.length > MAX_REMINDERS) {
    throw new TypeError('Invalid reminders');
  }
  const seen = new Set<string>();
  const out: ReminderConfig[] = [];
  for (const item of input as unknown[]) {
    if (typeof item !== 'object' || item === null) throw new TypeError('Invalid reminder');
    const { accountId, hour, minute } = item as Record<string, unknown>;
    const id = parseReminderAccountId(accountId);
    const time = parseReminderTime({ hour, minute });
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ accountId: id, time });
  }
  return out;
}
