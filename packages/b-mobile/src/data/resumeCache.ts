// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A small in-memory cache of "where you were" in a list screen, so returning to it after opening an
// entry (b-oss#182) lands on the same tab and page instead of a freshly-built default.
//
// Why this exists: `AppRoutes` renders a `<Switch>` inside one `<IonRouterOutlet>` child, so Ionic
// sees a single view and never keeps a page mounted behind a pushed one — opening an entry
// *unmounts* Browse, and Back rebuilds it. The proper fix (a real view stack) is app-wide and is
// tracked separately (#183); this keeps the user's place across that unmount without changing how
// every other screen behaves.
//
// Entries expire (TTL) so a feed you left half an hour ago is refetched rather than shown stale.
// Not persisted across app restarts, by design.

const TTL_MS = 10 * 60 * 1000;

const cache = new Map<string, { value: unknown; at: number }>();

export function resumeGet<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function resumeSet<T>(key: string, value: T): void {
  cache.set(key, { value, at: Date.now() });
}

/** Forget everything, or only keys starting with `prefix` (e.g. one account's after sign-out). */
export function resumeClear(prefix?: string): void {
  if (prefix === undefined) {
    cache.clear();
    return;
  }
  for (const key of [...cache.keys()]) if (key.startsWith(prefix)) cache.delete(key);
}
