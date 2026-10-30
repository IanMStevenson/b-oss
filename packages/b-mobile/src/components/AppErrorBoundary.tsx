// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Top-level error boundary. Without it, an uncaught render error unmounts the whole React tree
// and leaves a blank white screen with no way out. The fallback is plain HTML with inline styles,
// not Ionic, because the error may have come from inside Ionic itself. Error details are not
// logged or shown: they could carry tokens or account data.

import { Component, type ReactNode } from 'react';
import { recoverFromStaleChunk } from '../platform/staleSession.js';
import { t } from '../strings/index.js';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    // A lazy screen whose chunk vanished (desktop, files replaced under a running app): reload once.
    recoverFromStaleChunk(error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          minHeight: '100vh',
          padding: '24px',
          boxSizing: 'border-box',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h1 style={{ fontSize: '20px', margin: 0 }}>{t('GENERIC.crash.title')}</h1>
        <p style={{ margin: 0 }}>{t('GENERIC.crash.body')}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ fontSize: '16px', padding: '10px 24px', minHeight: '44px' }}
        >
          {t('GENERIC.crash.reload_button')}
        </button>
      </div>
    );
  }
}
