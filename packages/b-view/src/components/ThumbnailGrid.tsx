// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useState, useEffect, useRef, useCallback } from 'react';
import type { RefObject } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Image, Home, Eye, EyeOff, Search, X } from 'lucide-react';
import type { EntryIndex } from '../types.js';
import { DatePicker } from './DatePicker.js';
import { Pagination } from './Pagination.js';
import { useSwipeNav } from '../useSwipeNav.js';
import { usePinchZoom } from '../usePinchZoom.js';
import styles from './ThumbnailGrid.module.css';

// Matches CSS constants: grid padding:18px top/bottom 24px sides,
// controls bar: 28px buttons + 8+8px padding + 1px border = 45px,
// pagination row: 28px buttons + 12+12px padding = 52px.
// Gap is computed dynamically as 20% of tileSize in 'normal' margins mode (set via inline style).
const H_PAD = 48; // 24px each side
const V_PAD = 36; // 18px each side
const CONTROLS_H = 45;
const PAGINATION_H = 52;
const BASE_TILE_PX = 156;
const ZOOM_MIN_PERCENT = 30;
const ZOOM_MAX_PERCENT = 200;
// A flat zoom-percentage floor doesn't scale across device widths — on a wide/landscape screen it
// let zoom-out show far more columns than fit comfortably (confirmed live on a real device,
// b-oss#140). Cap zoom-out by minimum tile size as a fraction of the viewport instead, which
// targets the thing that actually matters (image size) rather than a flat percentage, and scales
// correctly across phone/tablet/foldable widths. Deliberately approximate (no padding/gap
// correction) — landing on N or N-1 columns after rounding is fine, not worth exact precision.
const MIN_COLUMNS_PORTRAIT = 6;
const MIN_COLUMNS_LANDSCAPE = 8;

type ThumbnailMargins = 'none' | 'narrow' | 'normal';

// 'narrow' deliberately computes cols/rows/pageSize the same way 'normal' does (H_PAD/V_PAD and a
// 20%-of-tileSize gap) — the spec is "same number of columns, but the margins/gaps themselves
// render at a few px" — only the rendered padding/gap shrink, not the layout math, so there's a
// few px of unused slack at the right/bottom edge rather than a stretched-to-fill tile size.
// 'none' is the deliberate exception: it recomputes cols/rows from its own zero padding/gap, so
// removing margins entirely also removes the space they used to reserve — "zoom becomes the
// column-count control" is just what that recomputation naturally produces, not separate logic.
const MARGIN_RENDER = {
  normal: { padding: undefined, gapPx: null },
  narrow: { padding: '4px', gapPx: 4 },
  none: { padding: '0px', gapPx: 0 },
} satisfies Record<ThumbnailMargins, { padding: string | undefined; gapPx: number | null }>;

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
  /** A plain search icon, rendered right after Home, instead of `search`'s own inline
   * query/results box — for a consumer whose "search" isn't a local filter over `entries` at
   * all, just a navigation trigger to a search experience it owns elsewhere. Mutually exclusive
   * with `search` in practice (a consumer wiring live local filtering has no use for a bare
   * button), but not enforced — nothing stops both being passed. */
  onSearchClick?: () => void;
  /** What `sizePercent={100}` actually renders as, in px — defaults to BASE_TILE_PX(156), tuned
   * for b-view-backup's desktop viewport. A consumer with a fundamentally different viewport
   * (a ~360px phone screen, where 156px tiles can't fit 3 across) can override this so its own
   * sensible default reads as a clean "100%" — rather than always inheriting the desktop
   * reference size and looking like an odd fraction. */
  baseTileSize?: number;
  /** Hides the ZoomIn/ZoomOut/%/Reset button group even when `onSizeChange` is given, for a host
   * that offers pinch-to-zoom (always wired up below when `onSizeChange` is present) as the only
   * zoom affordance. Home/search/DatePicker in the same controls bar are unaffected — this only
   * gates the zoom button cluster. Defaults true (today's behaviour). */
  showZoomControls?: boolean;
  /** Hides the pagination row entirely, regardless of page count. Defaults true (today's
   * behaviour) — b-view-backup's desktop consumer is unaffected either way. */
  showPagination?: boolean;
  /** 'normal' (default) is today's spacing. See the MARGIN_RENDER/column-math comment above for
   * what 'narrow'/'none' change. */
  margins?: ThumbnailMargins;
  /** Fired when the user reaches the last *currently-loaded* display page (i.e. there's no more
   * of `entries` left to page into locally) — for a host backed by server pagination to fetch
   * more, exactly when it's actually needed. Omitted: paging simply stops at the last loaded
   * page, as before. Not fired repeatedly for the same "no more loaded" state — only on the
   * transition into it — so a host doesn't need its own de-duplication. */
  onNearEnd?: () => void;
  /** A real, known total entry count for the feed `entries` is a partial view into — for a host
   * that can get one cheaply (a fixed depth limit it knows about a curated feed, a profile's own
   * entry_total, etc). Omitted: totalPages falls back to entries.length, i.e. "how much has
   * loaded so far" — correct once everything's loaded, but grows (and visibly changes the
   * pagination row's last label) while background prefetching is still catching up. Only affects
   * the displayed total/last-page label — hasNext/hasPrev and what you can actually page into
   * still depend on what's genuinely loaded into `entries`, never on this number. */
  totalEntryCount?: number;
  /** True once the host's own paged resource has confirmed there's genuinely nothing more to
   * fetch (its own `hasMore` is false) — the authoritative signal that whatever's in `entries`
   * right now *is* the real, complete total, overriding `totalEntryCount` if the two disagree.
   * `totalEntryCount` is necessarily a guess in some cases (a fixed depth limit a host believes
   * is accurate, but isn't guaranteed to be) — this is what lets a wrong guess correct itself
   * once the real data proves it wrong, rather than the pagination row continuing to offer pages
   * that don't exist. Omitted: `totalEntryCount` (if given) is trusted unconditionally, as
   * before. */
  allEntriesLoaded?: boolean;
  /** Absolute index of `entries[0]` in the full feed — 0 (the default) for a host that only ever
   * appends sequentially from the start. Non-zero after a host re-anchors its loaded window
   * somewhere else in response to `onSeek` (b-oss#153) — lets page-number math and hasPrev/hasNext
   * stay correct for a window that doesn't start at the beginning of the feed. */
  entriesOffset?: number;
  /** Fired when the user clicks a page number outside the currently loaded window — e.g. a
   * distant page in the fixed-cell pagination row (#143) that's nowhere near what's been fetched
   * so far. Carries the absolute entry index the host should fetch directly (a single seek, not a
   * walk through every intervening page — see usePagedResource's own seekTo doc comment for why
   * that matters). Omitted: clicking such a page silently clamps to whatever's loaded, which is
   * the exact bug #153 exists to fix — always wire this up alongside `entriesOffset`. */
  onSeek?: (targetIndex: number) => void;
  /** Fired when the user pages backward past the start of the currently loaded window (only
   * possible once `entriesOffset` is non-zero, i.e. after a seek) — for a host to fetch the one
   * API page immediately before its window and prepend it. */
  onLoadBefore?: () => void;
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
  onSearchClick,
  baseTileSize = BASE_TILE_PX,
  showZoomControls = true,
  showPagination = true,
  margins = 'normal',
  onNearEnd,
  totalEntryCount,
  allEntriesLoaded,
  entriesOffset = 0,
  onSeek,
  onLoadBefore,
}: ThumbnailGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height } = useContainerSize(containerRef);
  const [topLeftIndex, setTopLeftIndex] = useState(0);
  const [topLeftDate, setTopLeftDate] = useState<string | null>(null);

  const isSearchActive = search != null && search.query.trim() !== '';
  const displayEntries = search && isSearchActive ? search.results : entries;

  const tileSize = Math.round(baseTileSize * (sizePercent / 100));
  const normalGap = Math.round(tileSize * 0.2);
  const renderGap = MARGIN_RENDER[margins].gapPx ?? normalGap;
  const controlsH = onSizeChange || search || onSearchClick ? CONTROLS_H : 0;
  const paginationH = showPagination ? PAGINATION_H : 0;

  // cols/rows/pageSize: 'normal' and 'narrow' share this exact formula (H_PAD/V_PAD, normalGap) —
  // see the MARGIN_RENDER comment above for why. 'none' uses its own zero padding/gap instead.
  const calcHPad = margins === 'none' ? 0 : H_PAD;
  const calcVPad = margins === 'none' ? 0 : V_PAD;
  const calcGap = margins === 'none' ? renderGap : normalGap;

  // Derive cols/rows from available space; fall back to 2 until measured.
  const cols =
    width > 0 ? Math.max(2, Math.floor((width - calcHPad + calcGap) / (tileSize + calcGap))) : 2;

  // 'none' margins: cols * tileSize essentially never exactly equals the container's actual
  // width (tileSize only ever changes in whole zoom-percentage steps), which used to leave a
  // leftover strip as an unwanted edge margin even with padding/gap both 0 — the exact bug this
  // mode exists to avoid. Snap the *rendered* tile size to fill the row exactly; sizePercent
  // itself (what's persisted/shown in the zoom label) is untouched, so zoom still "means" the
  // same thing internally and this is purely a render-time rounding adjustment.
  const renderTileSize =
    margins === 'none' && width > 0 ? Math.floor(width / cols) : tileSize;

  // rows must divide by whatever size tiles actually render at — using the smaller, pre-snap
  // tileSize here (as this used to) undercounts each row's real height once 'none' margins snaps
  // tiles bigger to fill the row, so more rows get crammed into a page than actually fit on
  // screen (confirmed live on a real device, b-oss#139).
  const rowTileSize = margins === 'none' ? renderTileSize : tileSize;
  const rows =
    height > 0
      ? Math.max(
          2,
          Math.floor(
            (height - controlsH - paginationH - calcVPad + calcGap) / (rowTileSize + calcGap),
          ),
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
  // topLeftIndex is always an ABSOLUTE entry index (position in the full feed), not an index into
  // `entries` — the two only coincide while entriesOffset is 0, i.e. a host that's never seeked.
  // localTopLeft converts to the array-relative index actually needed for slicing; it can be
  // negative (target is before the loaded window — needs onLoadBefore) or beyond entries.length
  // (target hasn't arrived yet — needs onSeek or onNearEnd) whenever entries doesn't cover it yet.
  const boundedTopLeft = Math.max(0, topLeftIndex);
  const localTopLeft = boundedTopLeft - entriesOffset;
  const inWindow = localTopLeft >= 0 && localTopLeft < entries.length;
  const pageEntries = isSearchActive
    ? displayEntries
    : inWindow
      ? entries.slice(localTopLeft, localTopLeft + pageSize)
      : [];

  const isAligned = boundedTopLeft % pageSize === 0;
  const displayPage = isAligned
    ? boundedTopLeft / pageSize + 1
    : Math.floor(boundedTopLeft / pageSize) + 2;
  // A known real total (see the prop's own doc comment) drives the *displayed* total/last-page
  // label only — never allowed to be smaller than what's actually loaded, in case a host's known
  // total is stale (e.g. new entries published since it was fetched). Once the host confirms
  // there's genuinely nothing more to fetch (allEntriesLoaded), entriesOffset + entries.length IS
  // the real total by definition — this overrides a totalEntryCount that turns out to have been
  // wrong (too high), rather than continuing to offer pages that don't exist (b-oss#146: a
  // hardcoded guess like this can be wrong, and needs to fail gracefully when it is).
  const knownLoadedThrough = entriesOffset + entries.length;
  const effectiveTotalEntries = allEntriesLoaded
    ? knownLoadedThrough
    : Math.max(totalEntryCount ?? 0, knownLoadedThrough);
  const totalPages = isAligned
    ? Math.max(1, Math.ceil(effectiveTotalEntries / pageSize))
    : Math.max(2, Math.ceil(effectiveTotalEntries / pageSize) + 1);
  // hasPrev only checks "not already at the very start" — paging backward past what's loaded is
  // exactly what onLoadBefore is for, so it stays enabled even when that's a fetch, not just a
  // local reposition. hasNext deliberately stays tied to what's actually loaded (unchanged from
  // before entriesOffset existed): forward growth is onNearEnd's job, one page at a time.
  const hasPrev = boundedTopLeft > 0;
  const hasNext = localTopLeft + pageSize < entries.length;
  const needsBefore = localTopLeft < 0;

  // Fires exactly on the transition into "no more locally-loaded page ahead" — not on every
  // render while that stays true — since this only depends on `hasNext` itself, not on
  // `onNearEnd`'s identity (which a host may pass as a fresh closure every render). Deliberately
  // not deduped further than that: a host's own onLoadMore-style handler already no-ops safely
  // once there's genuinely nothing more on the server, so a harmless extra call here costs
  // nothing (see b-mobile's EntryGrid.tsx for the host side of this).
  useEffect(() => {
    if (!hasNext) onNearEnd?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasNext]);

  // Symmetric with the onNearEnd effect above, for the backward direction — only reachable once
  // entriesOffset is non-zero (a seek re-anchored the window somewhere mid-feed) and the user has
  // paged back past its start (b-oss#153).
  useEffect(() => {
    if (needsBefore) onLoadBefore?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsBefore]);

  const goToPrevPage = useCallback(
    () => setTopLeftIndex(Math.max(0, boundedTopLeft - pageSize)),
    [boundedTopLeft, pageSize],
  );
  const goToNextPage = useCallback(
    () => setTopLeftIndex(boundedTopLeft + pageSize),
    [boundedTopLeft, pageSize],
  );

  const swipe = useSwipeNav({
    onSwipeLeft: () => hasNext && goToNextPage(),
    onSwipeRight: () => hasPrev && goToPrevPage(),
  });

  const isLandscape = width > 0 && height > 0 && width > height;
  const minColumns = isLandscape ? MIN_COLUMNS_LANDSCAPE : MIN_COLUMNS_PORTRAIT;
  const dynamicMinPercent =
    width > 0 ? Math.round((width / minColumns / baseTileSize) * 100) : ZOOM_MIN_PERCENT;

  const pinch = usePinchZoom({
    sizePercent,
    onSizeChange,
    min: dynamicMinPercent,
    max: ZOOM_MAX_PERCENT,
  });

  // Track the top-left entry date for the internal calendar and external callback. A negative or
  // out-of-range localTopLeft (window doesn't cover it yet — mid-seek/mid-loadBefore) reads as
  // undefined here, same as any other out-of-bounds array access, so this just reports null.
  useEffect(() => {
    if (isSearchActive) return;
    const date = entries[localTopLeft]?.date ?? null;
    setTopLeftDate(date);
    onTopLeftEntryDate?.(date);
  }, [isSearchActive, localTopLeft, entries, onTopLeftEntryDate]);

  // Jump to the entry at topLeftIndex when jumpToEntryId changes. findIndex gives a local index
  // into `entries`; topLeftIndex is absolute, so entriesOffset has to be added back on.
  const lastJumpRef = useRef<string | null>(null);
  useEffect(() => {
    if (!jumpToEntryId || jumpToEntryId === lastJumpRef.current) return;
    const idx = entries.findIndex((e) => e.entry_id === jumpToEntryId);
    if (idx < 0) return;
    lastJumpRef.current = jumpToEntryId;
    setTopLeftIndex(entriesOffset + idx);
  }, [jumpToEntryId, entries, entriesOffset]);

  // If 2×2 minimum doesn't fit, let the container scroll rather than clip.
  const minTileSpan = 2 * (tileSize + calcGap) - calcGap;
  const minFitsH = width === 0 || width - calcHPad >= minTileSpan;
  const minFitsV = height === 0 || height - controlsH - paginationH - calcVPad >= minTileSpan;
  const overflow = minFitsH && minFitsV ? ('hidden' as const) : ('auto' as const);
  // Two-finger pinch and the browser's own native pinch-to-zoom would otherwise fight over the
  // same gesture — touch-action:none hands it entirely to usePinchZoom.ts. Left enabled (native
  // touch scrolling/zoom) in the two states where this element genuinely needs to scroll instead:
  // live search results, and the 2×2-doesn't-fit fallback above.
  const gridTouchAction = isSearchActive || overflow === 'auto' ? undefined : ('none' as const);

  return (
    <div ref={containerRef} className={styles.container} style={{ overflow }}>
      {(onSizeChange || search || onSearchClick) && (
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
                onClick={() => {
                  // Absolute 0 may not be within the current window post-seek — same "jump
                  // directly, don't walk backward one page at a time" reasoning as onPage below.
                  if (entriesOffset > 0) onSeek?.(0);
                  setTopLeftIndex(0);
                }}
                aria-label="First page"
              >
                <Home size={14} strokeWidth={1.6} />
              </button>
              {onSearchClick && (
                <button className={styles.iconBtn} onClick={onSearchClick} aria-label="Search">
                  <Search size={14} strokeWidth={1.6} />
                </button>
              )}
              {entries.length > 0 && (
                <DatePicker
                  entries={entries}
                  currentDate={topLeftDate}
                  onNavigate={(entryId) => {
                    const idx = entries.findIndex((e) => e.entry_id === entryId);
                    if (idx >= 0) setTopLeftIndex(entriesOffset + idx);
                  }}
                />
              )}
            </>
          )}
          {onSizeChange && showZoomControls && (
            <div className={styles.zoomGroup}>
              <button
                className={styles.iconBtn}
                onClick={() => onSizeChange(Math.max(dynamicMinPercent, sizePercent - 10))}
                aria-label="Zoom out"
              >
                <ZoomOut size={14} strokeWidth={1.6} />
              </button>
              <span className={styles.zoomLabel}>{sizePercent}%</span>
              <button
                className={styles.iconBtn}
                onClick={() => onSizeChange(Math.min(ZOOM_MAX_PERCENT, sizePercent + 10))}
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

      <div
        className={styles.scroll}
        style={{
          ...(isSearchActive ? { overflowY: 'auto' as const } : undefined),
          touchAction: gridTouchAction,
        }}
        onTouchStart={
          isSearchActive
            ? undefined
            : (e) => {
                swipe.onTouchStart(e);
                pinch.onTouchStart(e);
              }
        }
        onTouchMove={isSearchActive ? undefined : pinch.onTouchMove}
        onTouchEnd={
          isSearchActive
            ? undefined
            : (e) => {
                swipe.onTouchEnd(e);
                pinch.onTouchEnd(e);
              }
        }
      >
        {search && isSearchActive && search.status === 'done' && search.results.length === 0 ? (
          <div className={styles.searchEmpty}>No entries match &ldquo;{search.query}&rdquo;</div>
        ) : !isSearchActive && pageEntries.length === 0 ? (
          // Reachable two ways: a host's totalEntryCount guess was too high (b-oss#146) and the
          // user paged/jumped to a page that implied more content than genuinely exists; or the
          // target page is real but its data hasn't arrived yet — either still catching up from
          // onNearEnd, or a fetch just kicked off from onSeek/onLoadBefore (b-oss#153) — rather
          // than silently rendering an unexplained blank grid either way. allEntriesLoaded is the
          // only one of these that's permanent; the other two self-resolve once their fetch lands.
          <div className={styles.searchEmpty}>
            {allEntriesLoaded ? 'Nothing more to show here.' : 'Loading…'}
          </div>
        ) : (
          <div
            className={styles.grid}
            style={{
              gridTemplateColumns: `repeat(${cols}, ${renderTileSize}px)`,
              gap: `${renderGap}px`,
              padding: MARGIN_RENDER[margins].padding,
            }}
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
                tileSize={renderTileSize}
                showInfoOverlay={showInfoOverlay}
                assetRevision={assetRevision}
              />
            ))}
          </div>
        )}
      </div>

      {!isSearchActive && showPagination && totalPages > 1 && (
        <div className={styles.paginationRow}>
          <Pagination
            currentPage={displayPage}
            totalPages={totalPages}
            onPage={(n) => {
              // Computed directly from the page number and this grid's own pageSize, not as a
              // delta off the current position — page boundaries are absolute, so this is the
              // one place that needs to notice a target the loaded window doesn't cover yet and
              // ask the host to seek there directly (b-oss#153), rather than just repositioning
              // locally onto whatever's loaded and silently rendering the wrong page.
              const target = Math.max(0, (n - 1) * pageSize);
              if (target - entriesOffset < 0 || target - entriesOffset >= entries.length) {
                onSeek?.(target);
              }
              setTopLeftIndex(target);
            }}
            hasPrev={hasPrev}
            hasNext={hasNext}
            onPrev={goToPrevPage}
            onNext={goToNextPage}
            prevRef={prevBtnRef}
            nextRef={nextBtnRef}
          />
        </div>
      )}
    </div>
  );
}
