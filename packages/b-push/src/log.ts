// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Log lines for `wrangler tail` / Workers Logs (b-oss#238). Errors are reduced to name, code and
// message, never a request body or a token: every token this service holds is a secret, and an
// error's message is the only part of it that is safe to write out.

import { BlipfotoError } from '@b-oss/b-api';

const MAX_MESSAGE = 300;

export function describeError(err: unknown): string {
  if (err instanceof BlipfotoError) {
    return `BlipfotoError ${err.code}: ${err.message}`.slice(0, MAX_MESSAGE);
  }
  if (err instanceof Error) {
    return `${err.name}: ${err.message}`.slice(0, MAX_MESSAGE);
  }
  return 'non-Error value thrown';
}
