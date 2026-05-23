// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { Loader2 } from 'lucide-react';
import type { BackendContext } from './backend.js';
import { AppProvider, useApp } from './context/AppContext.js';
import { TopBar } from './components/TopBar.js';
import { Sidebar } from './components/Sidebar.js';
import { ToastHost } from './components/ToastHost.js';
import { FirstOpenScreen } from './components/screens/FirstOpenScreen.js';
import { OAuthSuccessScreen } from './components/screens/OAuthSuccessScreen.js';
import { HomeScreen } from './components/screens/HomeScreen.js';
import { EmptyAccountScreen } from './components/screens/EmptyAccountScreen.js';
import { SettingsPanel } from './components/screens/SettingsPanel.js';
import { LogPanel } from './components/screens/LogPanel.js';

function AppRoot() {
  const { state } = useApp();
  const { store, selectedAccountId, panel, justConnected } = state;

  const account = store?.accounts.find((a) => a.id === selectedAccountId) ?? null;
  const justConnectedAccount = justConnected
    ? (store?.accounts.find((a) => a.id === justConnected) ?? null)
    : null;

  function renderMainArea() {
    // OAuth success screen — one-time after account connect
    if (justConnectedAccount) {
      return <OAuthSuccessScreen account={justConnectedAccount} />;
    }

    if (panel === 'settings' && account) {
      return <SettingsPanel account={account} />;
    }
    if (panel === 'log' && account) {
      return <LogPanel account={account} />;
    }

    if (!account) return null;
    const isBackingUp = state.backupProgress[account.id] !== undefined;
    if (account.total_archived === 0 && !isBackingUp) {
      return <EmptyAccountScreen account={account} />;
    }

    return <HomeScreen account={account} />;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <TopBar />

      {/* Loading state */}
      {store === null && (
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

      {/* First open — no accounts yet */}
      {store !== null && store.accounts.length === 0 && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <FirstOpenScreen />
        </div>
      )}

      {/* Main layout with sidebar */}
      {store !== null && store.accounts.length > 0 && (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <Sidebar />
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
