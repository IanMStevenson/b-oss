// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { Loader2 } from 'lucide-react';
import type { BackendContext } from './backend.js';
import { AppProvider, useApp } from './context/AppContext.js';
import { useContainerWidth } from './hooks/useContainerWidth.js';
import { TopBar } from './components/TopBar.js';
import { Sidebar } from './components/Sidebar.js';
import { ToastHost } from './components/ToastHost.js';
import { ChooseFolderScreen } from './components/screens/ChooseFolderScreen.js';
import { FirstOpenScreen } from './components/screens/FirstOpenScreen.js';
import { OAuthSuccessScreen } from './components/screens/OAuthSuccessScreen.js';
import { HomeScreen } from './components/screens/HomeScreen.js';
import { EmptyAccountScreen } from './components/screens/EmptyAccountScreen.js';
import { SettingsPanel } from './components/screens/SettingsPanel.js';
import { LogPanel } from './components/screens/LogPanel.js';

const COMPACT_BREAKPOINT = 860;

function AppRoot() {
  const { state } = useApp();
  const { bootStage, store, selectedAccountId, panel, justConnected } = state;
  const [contentRef, contentWidth] = useContainerWidth();
  const compact = contentWidth > 0 && contentWidth < COMPACT_BREAKPOINT;

  const account = store?.accounts.find((a) => a.id === selectedAccountId) ?? null;
  const justConnectedAccount = justConnected
    ? (store?.accounts.find((a) => a.id === justConnected) ?? null)
    : null;

  function renderMainArea() {
    if (justConnectedAccount) {
      return <OAuthSuccessScreen account={justConnectedAccount} />;
    }

    if (panel === 'settings') {
      return <SettingsPanel />;
    }
    if (panel === 'log') {
      return <LogPanel />;
    }

    if (!account) return null;
    const isBackingUp = state.backupProgress[account.id] !== undefined;
    if (account.total_archived === 0 && !isBackingUp) {
      return <EmptyAccountScreen account={account} />;
    }

    return <HomeScreen account={account} compact={compact} />;
  }

  return (
    <div
      ref={contentRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <TopBar />

      {bootStage === 'loading' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Loader2
            size={32}
            strokeWidth={1.6}
            style={{ animation: 'spin 1s linear infinite', color: 'var(--muted-2)' }}
          />
        </div>
      )}

      {bootStage === 'pick-folder' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <ChooseFolderScreen />
        </div>
      )}

      {bootStage === 'first-account' && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <FirstOpenScreen />
        </div>
      )}

      {bootStage === 'ready' && store !== null && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {panel === null && <Sidebar compact={compact} />}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {renderMainArea()}
          </div>
        </div>
      )}

      <ToastHost />
    </div>
  );
}

export default function App({ backend }: { backend: BackendContext }) {
  return (
    <AppProvider backend={backend}>
      <AppRoot />
    </AppProvider>
  );
}
