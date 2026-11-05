// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The status line under the desktop notification settings (b-oss#673): when the shell last checked
// for new activity, when it will next, and how that went. Pure, so the wording is unit-tested; the
// facts come from the shell (platform/desktopNotify.ts), already free of tokens and content.

import type { DesktopAccountStatus } from '../platform/desktopNotify.js';

const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** "just now", "a minute ago", "3 minutes ago", "2 hours ago". */
export function agoText(ms: number): string {
  if (ms < 45_000) return 'just now';
  if (ms < 90_000) return 'a minute ago';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 90) return `${minutes} minutes ago`;
  return `${plural(Math.round(minutes / 60), 'hour')} ago`;
}

/** "in less than a minute", "in about 3 minutes". */
export function inText(ms: number): string {
  if (ms <= 0) return 'any moment now';
  if (ms < 45_000) return 'in less than a minute';
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return `in about ${plural(minutes, 'minute')}`;
}

export function statusLine(status: DesktopAccountStatus | null, now: number): string {
  if (!status) return 'Not checked yet';
  if (status.checking) return 'Checking now…';
  const parts: string[] = [];
  parts.push(
    status.lastCheckedAt === null
      ? 'Not checked yet'
      : `Checked ${agoText(Math.max(0, now - status.lastCheckedAt))}`,
  );
  if (status.nextCheckAt !== null) parts.push(`next check ${inText(status.nextCheckAt - now)}`);
  if (status.result) parts.push(status.result.text);
  return parts.join(' · ');
}

/** An error-ish result is shown in the warning colour. */
export function isProblem(status: DesktopAccountStatus | null): boolean {
  const kind = status?.result?.kind;
  return kind !== undefined && kind !== 'ok' && kind !== 'baseline';
}
