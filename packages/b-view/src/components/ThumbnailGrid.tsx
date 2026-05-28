// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useState, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Image, Home, Eye, EyeOff } from 'lucide-react';
import type { EntryIndex } from '../types.js';
import { DatePicker } from './DatePicker.js';
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

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const sfx =
    d === 1 || d === 21 || d === 31
      ? 'st'
      : d === 2 || d === 22
        ? 'nd'
        : d === 3 || d === 23
          ? 'rd'
          : 'th';
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${d}${sfx} ${months[m - 1]} ${y}`;
}

type ResolveAsset = (path: string) => Promise<string> | string;

interface ThumbnailGridProps {
  entries: EntryIndex[];
  selectedEntryId: string | null;
  onSelectEntry: (entryId: string) => void;
  sizePercent?: number;
  onSizeChange?: (newPercent: number) => void;
  showInfoOverlay?: boolean;
  onShowInfoOverlayChange?: (v: boolean) => void;
  baseUrl?: string;
  resolveAsset?: ResolveAsset;
  jumpToEntryId?: string | null;
  onTopLeftEntryDate?: (date: string | null) => void;
}

function ThumbnailItem({
  entry,
  selected,
  onSelect,
  baseUrl,
  resolveAsset,
  tileSize,
  showInfoOverlay,
}: {
  entry: EntryIndex;
  selected: boolean;
  onSelect: () => void;
  baseUrl?: string;
  resolveAsset?: ResolveAsset;
  tileSize: number;
  showInfoOverlay: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const syncSrc = resolveAsset
    ? null
    : baseUrl
      ? `${baseUrl}/${entry.thumbnail_path}`
      : entry.thumbnail_path;
  const [asyncSrc, setAsyncSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!resolveAsset) return;
    let cancelled = false;
    setAsyncSrc(null);
    void Promise.resolve(resolveAsset(entry.thumbnail_path)).then((url) => {
      if (!cancelled) setAsyncSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [resolveAsset, entry.thumbnail_path]);

  const src = resolveAsset ? asyncSrc : syncSrc;

  return (
    <button
      onClick={onSelect}
      aria-label={entry.date}
      aria-pressed={selected}
      className={`${styles.thumb} ${selected ? styles.thumbSelected : ''}`}
      style={{ width: tileSize, height: tileSize }}
    >
      {imgError || src === null ? (
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
      {showInfoOverlay && (
        <div className={styles.thumbOverlay}>
          <div className={styles.thumbOverlayDate}>{formatDate(entry.date)}</div>
          {tileSize >= 80 && <div className={styles.thumbOverlayTitle}>{entry.title}</div>}
        </div>
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
  showInfoOverlay = true,
  onShowInfoOverlayChange,
  baseUrl,
  resolveAsset,
  jumpToEntryId,
  onTopLeftEntryDate,
}: ThumbnailGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useContainerSize(containerRef);
  const [topLeftIndex, setTopLeftIndex] = useState(0);
  const [topLeftDate, setTopLeftDate] = useState<string | null>(null);

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
  const safeTopLeft = Math.max(
    0,
    Math.min(topLeftIndex, entries.length > 0 ? entries.length - 1 : 0),
  );
  const pageStart = safeTopLeft;
  const displayPage = pageSize > 0 ? Math.floor(safeTopLeft / pageSize) + 1 : 1;
  const pageEntries = entries.slice(pageStart, pageStart + pageSize);

  // Track the top-left entry date for the internal calendar and external callback.
  useEffect(() => {
    const date = entries[pageStart]?.date ?? null;
    setTopLeftDate(date);
    onTopLeftEntryDate?.(date);
  }, [pageStart, entries, onTopLeftEntryDate]);

  // Jump to the entry at topLeftIndex when jumpToEntryId changes.
  const lastJumpRef = useRef<string | null>(null);
  useEffect(() => {
    if (!jumpToEntryId || jumpToEntryId === lastJumpRef.current) return;
    const idx = entries.findIndex((e) => e.entry_id === jumpToEntryId);
    if (idx < 0) return;
    lastJumpRef.current = jumpToEntryId;
    setTopLeftIndex(idx);
  }, [jumpToEntryId, entries]);

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
            onClick={() => setTopLeftIndex(0)}
            aria-label="First page"
          >
            <Home size={14} strokeWidth={1.6} />
          </button>
          {entries.length > 0 && (
            <DatePicker
              entries={entries}
              currentDate={topLeftDate}
              onNavigate={(entryId) => {
                const idx = entries.findIndex((e) => e.entry_id === entryId);
                if (idx >= 0) setTopLeftIndex(idx);
              }}
            />
          )}
          <div className={styles.zoomGroup}>
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
          {onShowInfoOverlayChange && (
            <button
              className={styles.iconBtn}
              onClick={() => onShowInfoOverlayChange(!showInfoOverlay)}
              aria-label={showInfoOverlay ? 'Hide date/title overlay' : 'Show date/title overlay'}
            >
              {showInfoOverlay ? (
                <Eye size={14} strokeWidth={1.6} />
              ) : (
                <EyeOff size={14} strokeWidth={1.6} />
              )}
            </button>
          )}
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
              resolveAsset={resolveAsset}
              tileSize={tileSize}
              showInfoOverlay={showInfoOverlay}
            />
          ))}
        </div>
      </div>

      {totalPages > 1 && (
        <div className={styles.paginationRow}>
          <Pagination
            currentPage={displayPage}
            totalPages={totalPages}
            onPage={(n) => setTopLeftIndex((n - 1) * pageSize)}
            prevRef={prevBtnRef}
            nextRef={nextBtnRef}
          />
        </div>
      )}
    </div>
  );
}
