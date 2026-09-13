// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { CSSProperties, RefObject } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPage: (page: number) => void;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  prevRef?: RefObject<HTMLButtonElement | null>;
  nextRef?: RefObject<HTMLButtonElement | null>;
}

// Always exactly `cellCount` numbered cells (when there are that many pages to show), so the
// prev/next arrows sit at a fixed screen position regardless of which page is current — the
// previous version's arrows visibly shifted as the number of rendered items changed page to page
// (fewer near the edges, more in the middle, "..." sometimes present/absent), making "click next
// twice" unreliable since the button moved out from under a second click. Confirmed live on a
// real device and reported as a real usability problem, not just a cosmetic one.
//
// Always includes page 1 and the last page, plus immediate neighbours of `current`, then fills
// any remaining slots by repeatedly splitting the single largest gap between what's already
// chosen — the same "first/last always, neighbours always, split the gap" shape the user pointed
// at from blipfoto.com's own pagination, but generalised (iterative gap-splitting rather than a
// fixed left/right split) and sized down for a phone-width cell row rather than matching its
// exact 9-cell count. A "gap-split" cell is a real, clickable page number (not a dead ellipsis) —
// same as the reference.
function buildFixedPageItems(current: number, total: number, cellCount = 7): number[] {
  if (total <= cellCount) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const chosen = new Set<number>([1, total]);
  for (let i = current - 1; i <= current + 1; i++) {
    if (i > 1 && i < total) chosen.add(i);
  }

  while (chosen.size < cellCount) {
    const sorted = [...chosen].sort((a, b) => a - b);
    let bestIndex = -1;
    let bestGap = 1; // a gap of 1 (consecutive numbers) has nothing to split
    for (let i = 0; i < sorted.length - 1; i++) {
      const gap = sorted[i + 1] - sorted[i];
      if (gap > bestGap) {
        bestGap = gap;
        bestIndex = i;
      }
    }
    if (bestIndex === -1) break; // no gap left worth splitting — fewer than cellCount is correct
    chosen.add(Math.round((sorted[bestIndex] + sorted[bestIndex + 1]) / 2));
  }

  return [...chosen].sort((a, b) => a - b);
}

export function Pagination({
  currentPage,
  totalPages,
  onPage,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  prevRef,
  nextRef,
}: PaginationProps) {
  const items = buildFixedPageItems(currentPage, totalPages);

  // A real, explicit width (not min-width) sized to the widest page number this row will ever
  // need to show, so cells never resize as the current page — or the total, which can itself grow
  // in the background — changes digit count. `ch` is exactly "however wide one character of this
  // font is", the right unit for "wide enough for N digits".
  const cellWidth = `${Math.max(2, String(totalPages).length)}ch`;

  const btnStyle: CSSProperties = {
    width: cellWidth,
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
        ref={prevRef}
        style={{ ...btnStyle, width: '28px' }}
        disabled={!hasPrev}
        onClick={onPrev}
        aria-label="Previous page"
      >
        <ChevronLeft size={14} strokeWidth={1.6} />
      </button>

      {items.map((item) => (
        <button
          key={item}
          style={item === currentPage ? activeStyle : btnStyle}
          onClick={() => onPage(item)}
          aria-label={`Page ${item}`}
          aria-current={item === currentPage ? 'page' : undefined}
        >
          {item}
        </button>
      ))}

      <button
        ref={nextRef}
        style={{ ...btnStyle, width: '28px' }}
        disabled={!hasNext}
        onClick={onNext}
        aria-label="Next page"
      >
        <ChevronRight size={14} strokeWidth={1.6} />
      </button>
    </div>
  );
}
