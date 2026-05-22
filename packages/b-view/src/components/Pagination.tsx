// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPage: (page: number) => void;
}

function buildPageItems(current: number, total: number): Array<number | '...'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const items: Array<number | '...'> = [];
  const delta = 2;
  const left = Math.max(2, current - delta);
  const right = Math.min(total - 1, current + delta);

  items.push(1);
  if (left > 2) items.push('...');
  for (let i = left; i <= right; i++) items.push(i);
  if (right < total - 1) items.push('...');
  items.push(total);

  return items;
}

export function Pagination({ currentPage, totalPages, onPage }: PaginationProps) {
  const items = buildPageItems(currentPage, totalPages);

  const btnStyle: CSSProperties = {
    minWidth: '28px',
    height: '28px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    fontSize: '13px',
    padding: '0 4px',
    color: 'var(--ink-2)',
  };

  const activeStyle: CSSProperties = {
    ...btnStyle,
    background: 'var(--green-800)',
    color: '#fff',
    fontWeight: 600,
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
      <button
        style={btnStyle}
        disabled={currentPage === 1}
        onClick={() => onPage(currentPage - 1)}
        aria-label="Previous page"
      >
        <ChevronLeft size={14} strokeWidth={1.6} />
      </button>

      {items.map((item, idx) =>
        item === '...' ? (
          <span key={`ellipsis-${idx}`} style={{ ...btnStyle, color: 'var(--muted)' }}>
            …
          </span>
        ) : (
          <button
            key={item}
            style={item === currentPage ? activeStyle : btnStyle}
            onClick={() => onPage(item)}
            aria-label={`Page ${item}`}
            aria-current={item === currentPage ? 'page' : undefined}
          >
            {item}
          </button>
        ),
      )}

      <button
        style={btnStyle}
        disabled={currentPage === totalPages}
        onClick={() => onPage(currentPage + 1)}
        aria-label="Next page"
      >
        <ChevronRight size={14} strokeWidth={1.6} />
      </button>
    </div>
  );
}
