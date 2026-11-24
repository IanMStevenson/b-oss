// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// STUB (red tests first): passes everything through.
import type { ReactNode } from 'react';

export function DraftNavigationGuard({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/** Runs `run` after the member has agreed to lose an unsaved draft (at once when there is none). */
export function useDraftLeaveGuard(): { confirmLeave: (run: () => void) => void } {
  return { confirmLeave: (run) => run() };
}
