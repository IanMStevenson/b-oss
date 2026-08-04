// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Debounces a value; the request-id supersession that actually protects against stale in-flight
// responses stays in useResource/usePagedResource (§7) — this only delays *feeding* those hooks a
// new input, it doesn't duplicate their cancellation logic. SCR-03's search term and SCR-04's
// pan/zoom-triggered bounds both debounce this way: debounce the input, let the existing
// request-id-superseding fetch hooks handle the rest, per PLAN.md's "don't invent a new
// mechanism" instruction for this phase.

import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
