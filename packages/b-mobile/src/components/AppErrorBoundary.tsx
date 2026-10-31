// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Top-level error boundary. Without it, an uncaught render error unmounts the whole React tree
// and leaves a blank white screen with no way out. The fallback is plain HTML with inline styles,
// not Ionic, because the error may have come from inside Ionic itself. On Android and the web the
// error is neither logged nor shown (it could carry tokens or account data). On the desktop shell it
// is written, redacted, to the shell's log file, and the screen offers "Copy details" and "Open log
// folder" (platform/diagnostics.ts, b-oss#639).

import { Component, type ErrorInfo as ReactErrorInfo, type ReactNode } from 'react';
import {
  buildErrorDetails,
  copyErrorDetails,
  hasErrorDiagnostics,
  logError,
  openLogFolder,
  redact,
  toErrorInfo,
  type ErrorInfo,
} from '../platform/diagnostics.js';
import { recoverFromStaleChunk } from '../platform/staleSession.js';
import { t } from '../strings/index.js';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  /** Only set on the desktop shell. */
  info?: ErrorInfo;
  copied?: boolean;
}

const SECONDARY_BUTTON = { fontSize: '14px', padding: '8px 16px', minHeight: '36px' } as const;

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, errorInfo: ReactErrorInfo): void {
    if (hasErrorDiagnostics()) {
      const info = toErrorInfo('boundary', error, errorInfo.componentStack ?? undefined);
      logError(info);
      this.setState({ info });
    }
    // A lazy screen whose chunk vanished (desktop, files replaced under a running app): reload once.
    recoverFromStaleChunk(error);
  }

  private copy = (): void => {
    const { info } = this.state;
    if (!info) return;
    void copyErrorDetails(buildErrorDetails(info)).then(() => this.setState({ copied: true }));
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const { info, copied } = this.state;
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
        {info && (
          <>
            <p
              style={{
                margin: 0,
                maxWidth: '600px',
                fontSize: '13px',
                opacity: 0.8,
                wordBreak: 'break-word',
              }}
            >
              {redact(info.message)}
            </p>
            <div
              style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}
            >
              <button type="button" onClick={this.copy} style={SECONDARY_BUTTON}>
                {copied ? t('GENERIC.crash.copied') : t('GENERIC.crash.copy_button')}
              </button>
              <button type="button" onClick={() => void openLogFolder()} style={SECONDARY_BUTTON}>
                {t('GENERIC.crash.open_log_button')}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }
}
