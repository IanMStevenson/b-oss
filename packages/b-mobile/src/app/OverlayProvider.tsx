// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Owns every overlay (account switcher, upgrade prompt, first-run explainer, confirmation
// dialogs) as Ionic overlays opened imperatively, kept out of the router (§5) — dismissing a
// dialog is not a navigation, and rules.md is explicit the account switcher "is not a new
// screen ID".
// TODO(Phase 2+): real overlay state as each one is built.

import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

interface OverlayState {
  kind: null;
}

interface OverlayContextValue {
  overlay: OverlayState;
}

const OverlayContext = createContext<OverlayContextValue | null>(null);

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [overlay] = useState<OverlayState>({ kind: null });
  return <OverlayContext.Provider value={{ overlay }}>{children}</OverlayContext.Provider>;
}

export function useOverlay(): OverlayContextValue {
  const ctx = useContext(OverlayContext);
  if (!ctx) throw new Error('useOverlay must be used within OverlayProvider');
  return ctx;
}
