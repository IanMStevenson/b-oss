// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

export interface SplitButtonAction {
  label: string;
  onSelect: () => void;
}

interface SplitButtonProps {
  primaryLabel: string;
  onPrimary: () => void;
  menu: SplitButtonAction[];
  /** "primary" = filled green CTA, "secondary" = outlined sidebar style. */
  variant?: 'primary' | 'secondary';
}

export function SplitButton({
  primaryLabel,
  onPrimary,
  menu,
  variant = 'primary',
}: SplitButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent): void {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const isPrimary = variant === 'primary';

  const baseBg = isPrimary ? 'var(--green-800)' : 'transparent';
  const hoverBg = isPrimary ? 'var(--green-700)' : 'var(--green-50)';
  const fg = isPrimary ? 'white' : 'var(--green-700)';
  const border = isPrimary ? 'none' : '1px solid var(--line)';
  const dividerColor = isPrimary ? 'rgba(255, 255, 255, 0.25)' : 'var(--line)';

  const sharedBtnStyle: CSSProperties = {
    height: isPrimary ? 38 : undefined,
    padding: isPrimary ? '0 24px' : '8px 12px',
    background: baseBg,
    color: fg,
    fontSize: isPrimary ? 14 : 13,
    fontWeight: isPrimary ? 600 : 500,
    cursor: 'pointer',
    border,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div
        style={{
          display: 'flex',
          width: '100%',
          borderRadius: 7,
          overflow: 'hidden',
          border,
        }}
      >
        <button
          onClick={onPrimary}
          style={{
            ...sharedBtnStyle,
            flex: 1,
            border: 'none',
            borderRight: `1px solid ${dividerColor}`,
            borderRadius: 0,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = hoverBg;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = baseBg;
          }}
        >
          {primaryLabel}
        </button>
        <button
          aria-label="More options"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          style={{
            ...sharedBtnStyle,
            width: isPrimary ? 36 : 32,
            padding: 0,
            border: 'none',
            borderRadius: 0,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = hoverBg;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = baseBg;
          }}
        >
          <ChevronDown size={14} strokeWidth={2} />
        </button>
      </div>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            minWidth: 220,
            background: 'white',
            border: '1px solid var(--line)',
            borderRadius: 8,
            boxShadow: '0 6px 24px rgba(0, 0, 0, 0.08)',
            padding: 4,
            zIndex: 10,
          }}
        >
          {menu.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                borderRadius: 5,
                background: 'transparent',
                border: 'none',
                color: 'var(--ink)',
                fontSize: 13,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'var(--green-50)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
