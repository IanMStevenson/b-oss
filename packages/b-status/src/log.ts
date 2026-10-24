// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Log lines for `wrangler tail` / Workers Logs. Errors reduce to name and message only.

const MAX_MESSAGE = 300;

export function describeError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`.slice(0, MAX_MESSAGE);
  return 'non-Error value thrown';
}
