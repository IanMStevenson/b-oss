// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useState, useEffect, useRef, useCallback } from 'react';
import type { RefObject } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Image, Home, Eye, EyeOff, Search, X } from 'lucide-react';
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

/**
 * In-grid search is owned by the caller, not this component — it needs a hook
 * (`useSearchEntries` in `@b-oss/b-view-backup`, or an app's own live-search resource) to produce
 * this state, and this component has no opinion on where that comes from. Passing `search`
 * shows the search box; omitting it hides it, same as today's `resolveEntry == null`.
 */
interface ThumbnailGridSearch {
  query: string;
  onQueryChange: (query: string) => void;
  results: EntryIndex[];
  status: 'idle' | 'scanning' | 'done';
  progress: { loaded: number; total: number };
}

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
  invalidateAsset?: (path: string) => void;
  jumpToEntryId?: string | null;
  onTopLeftEntryDate?: (date: string | null) => void;
  search?: ThumbnailGridSearch;
  assetRevision?: number;
}

function ThumbnailItem({
  entry,
  selected,
  onSelect,
  baseUrl,
  resolveAsset,
  invalidateAsset,
  tileSize,
  showInfoOverlay,
  assetRevision,
}: {
  entry: EntryIndex;
  selected: boolean;
  onSelect: () => void;
  baseUrl?: string;
  resolveAsset?: ResolveAsset;
  invalidateAsset?: (path: string) => void;
  tileSize: number;
  showInfoOverlay: boolean;
  assetRevision?: number;
}) {
  const [imgError, setImgError] = useState(false);
  const syncSrc = resolveAsset
    ? null
    : baseUrl
      ? `${baseUrl}/${entry.thumbnail_path}`
      : entry.thumbnail_path;
  const [asyncSrc, setAsyncSrc] = useState<string | null>(null);
  // Track whether the last load attempt succeeded so that revision bumps only
  // trigger a retry for items that previously failed, avoiding flicker on
  // successfully-loaded thumbnails during active backup polling.
  const loadedRef = useRef(false);

  const load = useCallback(() => {
    if (!resolveAsset) return;
    let cancelled = false;
    setAsyncSrc(null);
    setImgError(false);
    loadedRef.current = false;
    Promise.resolve(resolveAsset(entry.thumbnail_path))
      .then((url) => {
        if (!cancelled) {
          loadedRef.current = true;
          setAsyncSrc(url);
        }
      })
      .catch(() => {
        if (!cancelled) setImgError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [resolveAsset, entry.thumbnail_path]);

  // Re-run on path/resolver changes (covers new entries and initial mount).
  useEffect(load, [load]);

  // On each revision bump, only retry if the previous attempt failed.
  useEffect(() => {
    if (loadedRef.current) return;
    return load();
  }, [assetRevision, load]);

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
          onError={() => {
            invalidateAsset?.(entry.thumbnail_path);
            loadedRef.current = false;
            setImgError(true);
          }}
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
  invalidateAsset,
  jumpToEntryId,
  onTopLeftEntryDate,
  search,
  assetRevision,
}: ThumbnailGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useContainerSize(containerRef);
  const [topLeftIndex, setTopLeftIndex] = useState(0);
  const [topLeftDate, setTopLeftDate] = useState<string | null>(null);

  const isSearchActive = search != null && search.query.trim() !== '';
  const displayEntries = search && isSearchActive ? search.results : entries;

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
  const pageEntries = isSearchActive
    ? displayEntries
    : entries.slice(pageStart, pageStart + pageSize);

  const isAligned = safeTopLeft % pageSize === 0;
  const displayPage = isAligned
    ? safeTopLeft / pageSize + 1
    : Math.floor(safeTopLeft / pageSize) + 2;
  const totalPages = isAligned
    ? Math.max(1, Math.ceil(entries.length / pageSize))
    : Math.max(2, Math.ceil(entries.length / pageSize) + 1);
  const hasPrev = safeTopLeft > 0;
  const hasNext = safeTopLeft + pageSize < entries.length;

  // Track the top-left entry date for the internal calendar and external callback.
  useEffect(() => {
    if (isSearchActive) return;
    const date = entries[pageStart]?.date ?? null;
    setTopLeftDate(date);
    onTopLeftEntryDate?.(date);
  }, [isSearchActive, pageStart, entries, onTopLeftEntryDate]);

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
      {(onSizeChange || search) && (
        <div className={styles.controls}>
          <div style={{ flex: 1 }} />
          {search && (
            <div className={styles.searchBox}>
              <Search size={13} strokeWidth={1.6} className={styles.searchIcon} />
              <input
                type="search"
                className={styles.searchInput}
                placeholder="Search entries…"
                value={search.query}
                onChange={(e) => search.onQueryChange(e.target.value)}
                aria-label="Search entries"
              />
              {search.query && (
                <button
                  className={styles.searchClear}
                  onClick={() => search.onQueryChange('')}
                  aria-label="Clear search"
                >
                  <X size={12} strokeWidth={2} />
                </button>
              )}
            </div>
          )}
          {search && isSearchActive && search.status === 'scanning' && (
            <span className={styles.searchProgress}>
              {search.progress.loaded} / {search.progress.total}
            </span>
          )}
          {!isSearchActive && (
            <>
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
            </>
          )}
          {onSizeChange && (
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
          )}
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

      <div className={styles.scroll} style={isSearchActive ? { overflowY: 'auto' } : undefined}>
        {search && isSearchActive && search.status === 'done' && search.results.length === 0 ? (
          <div className={styles.searchEmpty}>No entries match &ldquo;{search.query}&rdquo;</div>
        ) : (
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
                invalidateAsset={invalidateAsset}
                tileSize={tileSize}
                showInfoOverlay={showInfoOverlay}
                assetRevision={assetRevision}
              />
            ))}
          </div>
        )}
      </div>

      {!isSearchActive && totalPages > 1 && (
        <div className={styles.paginationRow}>
          <Pagination
            currentPage={displayPage}
            totalPages={totalPages}
            onPage={(n) => setTopLeftIndex(Math.max(0, safeTopLeft + (n - displayPage) * pageSize))}
            hasPrev={hasPrev}
            hasNext={hasNext}
            onPrev={() => setTopLeftIndex(Math.max(0, safeTopLeft - pageSize))}
            onNext={() => setTopLeftIndex(safeTopLeft + pageSize)}
            prevRef={prevBtnRef}
            nextRef={nextBtnRef}
          />
        </div>
      )}
    </div>
  );
}
