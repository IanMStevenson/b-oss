// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useState, useRef, useEffect } from 'react';
import { Info, X } from 'lucide-react';
import { useApp } from '../context/AppContext.js';

const YEAR = new Date().getFullYear();

export function InfoBadge() {
  const [open, setOpen] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const { backend } = useApp();

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="About b-ark"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          borderRadius: 6,
          color: 'white',
          background: open ? 'rgba(255,255,255,0.15)' : 'transparent',
        }}
      >
        <Info size={16} strokeWidth={1.6} />
      </button>

      {open && (
        <div
          ref={popupRef}
          style={{
            position: 'absolute',
            top: 36,
            right: 0,
            width: 300,
            background: 'white',
            border: '1px solid var(--line)',
            borderRadius: 10,
            boxShadow: '0 1px 2px rgba(15,23,32,0.04), 0 8px 24px rgba(15,23,32,0.06)',
            padding: '18px 20px',
            zIndex: 200,
          }}
        >
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '-0.01em' }}>
              About b-ark
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{ color: 'var(--muted)', display: 'flex', borderRadius: 4, padding: 2 }}
            >
              <X size={14} strokeWidth={1.6} />
            </button>
          </div>
          <p style={{ marginTop: 10, fontSize: 13, lineHeight: 1.55, color: 'var(--ink-2)' }}>
            b-ark is an open-source Blipfoto journal backup app, part of the <strong>b-oss</strong>{' '}
            project.
          </p>
          <p style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
            Version {backend.appVersion}
          </p>
          <p style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)' }}>
            &copy; {YEAR} Ian Stevenson. GPLv3.
          </p>
          <p style={{ marginTop: 8, fontSize: 12 }}>
            <a
              href="https://github.com/ianstevenson/b-oss"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--green-700)' }}
            >
              github.com/ianstevenson/b-oss
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
