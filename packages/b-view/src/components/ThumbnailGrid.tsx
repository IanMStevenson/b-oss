// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useState, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Image, Home } from 'lucide-react';
import type { EntryIndex } from '../types.js';
import { Pagination } from './Pagination.js';
import styles from './ThumbnailGrid.module.css';

// Matches CSS constants: grid padding:18px top/bottom 24px sides,
// controls bar: 28px buttons + 8+8px padding + 1px border = 45px,
// pagination row: 28px buttons + 12+12px padding = 52px.
// Gap is computed dynamically as 20% of tileSize (set via inline style).
const H_PAD = 48; // 24px each side
const V_PAD = 36; // 18px each side
const CONTROLS_H = 45;
const PAGINATION_H = 52;
const BASE_TILE_PX = 156;

function useContainerSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

interface ThumbnailGridProps {
  entries: EntryIndex[];
  selectedEntryId: string | null;
  onSelectEntry: (entryId: string) => void;
  sizePercent?: number;
  onSizeChange?: (newPercent: number) => void;
  baseUrl?: string;
}

function ThumbnailItem({
  entry,
  selected,
  onSelect,
  baseUrl,
  tileSize,
}: {
  entry: EntryIndex;
  selected: boolean;
  onSelect: () => void;
  baseUrl?: string;
  tileSize: number;
}) {
  const [imgError, setImgError] = useState(false);
  const src = baseUrl ? `${baseUrl}/${entry.thumbnail_path}` : entry.thumbnail_path;

  return (
    <button
      onClick={onSelect}
      aria-label={entry.date}
      aria-pressed={selected}
      className={`${styles.thumb} ${selected ? styles.thumbSelected : ''}`}
      style={{ width: tileSize, height: tileSize }}
    >
      {imgError ? (
        <div className={styles.thumbPlaceholder}>
          <Image size={20} strokeWidth={1.6} color="var(--muted-2)" />
        </div>
      ) : (
        <img
          src={src}
          alt={entry.title}
          loading="lazy"
          onError={() => setImgError(true)}
          className={styles.thumbImg}
        />
      )}
    </button>
  );
}

export function ThumbnailGrid({
  entries,
  selectedEntryId,
  onSelectEntry,
  sizePercent = 100,
  onSizeChange,
  baseUrl,
}: ThumbnailGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useContainerSize(containerRef);
  const [currentPage, setCurrentPage] = useState(1);

  const tileSize = Math.round(BASE_TILE_PX * (sizePercent / 100));
  const gap = Math.round(tileSize * 0.2);
  const controlsH = onSizeChange ? CONTROLS_H : 0;

  // Derive cols/rows from available space; fall back to 2 until measured.
  const cols = width > 0 ? Math.max(2, Math.floor((width - H_PAD + gap) / (tileSize + gap))) : 2;
  const rows =
    height > 0
      ? Math.max(
          2,
          Math.floor((height - controlsH - PAGINATION_H - V_PAD + gap) / (tileSize + gap)),
        )
      : 2;
  const pageSize = cols * rows;

  // Reset to page 1 whenever the computed page size changes.
  const prevPageSize = useRef(pageSize);
  useEffect(() => {
    if (prevPageSize.current !== pageSize) {
      prevPageSize.current = pageSize;
      setCurrentPage(1);
    }
  }, [pageSize]);

  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));

  const prevBtnRef = useRef<HTMLButtonElement>(null);
  const nextBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prevBtnRef.current?.click();
      if (e.key === 'ArrowRight') nextBtnRef.current?.click();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageEntries = entries.slice(pageStart, pageStart + pageSize);

  // If 2×2 minimum doesn't fit, let the container scroll rather than clip.
  const minTileSpan = 2 * (tileSize + gap) - gap;
  const minFitsH = width === 0 || width - H_PAD >= minTileSpan;
  const minFitsV = height === 0 || height - controlsH - PAGINATION_H - V_PAD >= minTileSpan;
  const overflow = minFitsH && minFitsV ? ('hidden' as const) : ('auto' as const);

  return (
    <div ref={containerRef} className={styles.container} style={{ overflow }}>
      {onSizeChange && (
        <div className={styles.controls}>
          <button
            className={styles.iconBtn}
            onClick={() => setCurrentPage(1)}
            aria-label="First page"
          >
            <Home size={14} strokeWidth={1.6} />
          </button>
          <button
            className={styles.iconBtn}
            onClick={() => onSizeChange(Math.max(30, sizePercent - 10))}
            aria-label="Zoom out"
          >
            <ZoomOut size={14} strokeWidth={1.6} />
          </button>
          <span className={styles.zoomLabel}>{sizePercent}%</span>
          <button
            className={styles.iconBtn}
            onClick={() => onSizeChange(Math.min(200, sizePercent + 10))}
            aria-label="Zoom in"
          >
            <ZoomIn size={14} strokeWidth={1.6} />
          </button>
          <button
            className={styles.iconBtn}
            onClick={() => onSizeChange(100)}
            aria-label="Reset zoom"
          >
            <RotateCcw size={14} strokeWidth={1.6} />
          </button>
        </div>
      )}

      <div className={styles.scroll}>
        <div
          className={styles.grid}
          style={{ gridTemplateColumns: `repeat(${cols}, ${tileSize}px)`, gap: `${gap}px` }}
        >
          {pageEntries.map((entry) => (
            <ThumbnailItem
              key={entry.entry_id}
              entry={entry}
              selected={entry.entry_id === selectedEntryId}
              onSelect={() => onSelectEntry(entry.entry_id)}
              baseUrl={baseUrl}
              tileSize={tileSize}
            />
          ))}
        </div>
      </div>

      {totalPages > 1 && (
        <div className={styles.paginationRow}>
          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            onPage={setCurrentPage}
            prevRef={prevBtnRef}
            nextRef={nextBtnRef}
          />
        </div>
      )}
    </div>
  );
}
