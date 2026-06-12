// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useEffect, type ReactElement } from 'react';
import type { Toast } from './view-types.js';

const AUTO_DISMISS_MS = 5000;

interface ToastHostProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export function ToastHost({ toasts, onDismiss }: ToastHostProps) {
  if (toasts.length === 0) return null;

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
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

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
        onClick={() => onDismiss(toast.id)}
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

function styleForLevel(level: Toast['level']): { icon: ReactElement; accent: string } {
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
