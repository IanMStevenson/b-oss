// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// TODO F's copy deck (app-architecture.md §2/§15), typed. `deck.ts` is generated from
// docs/AppSpec/TextStrings.csv — see scripts/generate-strings.mjs. This module is the one hand-
// written piece: a typed key lookup plus `{placeholder}` interpolation for the handful of draft
// strings that carry one (e.g. `{username}`).

import { STRINGS } from './deck.js';

export type StringKey = keyof typeof STRINGS;

/** Looks up `key` and fills in any `{name}` tokens from `vars`. A token with no matching var is
 * left as-is rather than silently dropped, so a missing var shows up as visibly wrong in manual
 * testing instead of vanishing. */
export function t(key: StringKey, vars?: Record<string, string>): string {
  const text: string = STRINGS[key];
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(vars, name) ? vars[name] : match,
  );
}
