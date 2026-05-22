// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useEffect } from 'react';
import { useApp } from '../context/AppContext.js';
import type { Toast } from '../context/reducer.js';

const AUTO_DISMISS_MS = 5000;

export function ToastHost() {
  const { state } = useApp();
  if (state.toasts.length === 0) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 1000,
        pointerEvents: 'none',
      }}
    >
      {state.toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const { dispatch } = useApp();

  useEffect(() => {
    const timer = setTimeout(
      () => dispatch({ type: 'toast:dismiss', id: toast.id }),
      AUTO_DISMISS_MS,
    );
    return () => clearTimeout(timer);
  }, [toast.id, dispatch]);

  const { icon, accent } = styleForLevel(toast.level);

  return (
    <div
      role="alert"
      style={{
        pointerEvents: 'auto',
        minWidth: 280,
        maxWidth: 380,
        background: 'white',
        border: `1px solid ${accent}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 8,
        boxShadow: '0 6px 24px rgba(0, 0, 0, 0.10)',
        padding: '10px 12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        fontSize: 13,
        color: 'var(--ink)',
        animation: 'b-ark-toast-in 180ms ease-out',
      }}
    >
      <span style={{ color: accent, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <span style={{ flex: 1, lineHeight: 1.45 }}>{toast.message}</span>
      <button
        aria-label="Dismiss"
        onClick={() => dispatch({ type: 'toast:dismiss', id: toast.id })}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 2,
          marginTop: -2,
          color: 'var(--muted)',
          cursor: 'pointer',
          display: 'flex',
        }}
      >
        <X size={14} strokeWidth={1.8} />
      </button>
    </div>
  );
}

function styleForLevel(level: Toast['level']): { icon: JSX.Element; accent: string } {
  switch (level) {
    case 'error':
      return { icon: <AlertCircle size={16} strokeWidth={1.8} />, accent: 'var(--rag-red)' };
    case 'warn':
      return {
        icon: <AlertTriangle size={16} strokeWidth={1.8} />,
        accent: 'var(--rag-amber)',
      };
    default:
      return { icon: <Info size={16} strokeWidth={1.8} />, accent: 'var(--green-700)' };
  }
}
