// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Electron container for the shared StatusBar: supplies live backup progress
// from the reducer and wires "View log" to the panel dispatch; presentation
// lives in @b-oss/b-ark-ui-components.
import { StatusBar as StatusBarView } from '@b-oss/b-ark-ui-components';
import type { AccountConfig } from '../backend.js';
import { useApp } from '../context/AppContext.js';

interface StatusBarProps {
  account: AccountConfig;
  compact?: boolean;
}

export function StatusBar({ account, compact }: StatusBarProps) {
  const { state, dispatch } = useApp();
  return (
    <StatusBarView
      account={account}
      progress={state.backupProgress[account.id]}
      onViewLog={() => dispatch({ type: 'panel:open', panel: 'log' })}
      compact={compact}
    />
  );
}
