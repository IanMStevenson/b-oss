// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The entry page's navigation strip — a dark date tile followed by flat square buttons: calendar,
// history, and solid ◀ ▶ — the strongest single style cue of blipfoto.com's entry page, and a
// large touch target on a phone. Replaces the old chevron row (b-oss#169, epic #167).
//
// Nothing here knows how to *find* entries: the host supplies the lookups it can actually do.
// The viewer has the whole journal locally (`entries` → the existing popup calendar); the app can
// only ask the API about the signed-in user's own journal (journal/day is user-auth only and takes
// no username), so it supplies `onPickDate` / `loadHistory` for own entries and omits them
// otherwise — a button with nothing behind it is simply not rendered.

import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, History as HistoryIcon, Loader2 } from 'lucide-react';
import type { EntryIndex } from '../types.js';
import { formatStripDate } from '../entryDates.js';
import { DatePicker } from './DatePicker.js';
import { AsyncThumb, type ResolveAsset } from './AsyncThumb.js';
import styles from './EntryNavStrip.module.css';

/** One entry offered by the history pop-down — "1 year ago", "1 year ahead". */
export interface HistoryItem {
  label: string;
  entryId: string;
  date: string;
  thumbnailPath: string;
}

export interface EntryNavStripProps {
  /** The entry's `YYYY-MM-DD` date, shown on the tile. */
  date: string;
  /** ◀ — the older neighbour. */
  prevEntryId: string | null;
  /** ▶ — the newer neighbour. */
  nextEntryId: string | null;
  onNavigate: (entryId: string) => void;
  /** Every entry the host has locally: enables the popup calendar (the viewer). */
  entries?: EntryIndex[];
  /** Chosen `YYYY-MM-DD` from the platform's native date picker (the app). Ignored when
   * `entries` is given. */
  onPickDate?: (date: string) => void;
  /** Called each time the history pop-down opens (not on render — it may cost an API call per
   * entry). Resolve to the entries to offer; an empty array shows "nothing either side". Omit to
   * hide the history button. */
  loadHistory?: () => Promise<HistoryItem[]>;
  resolveAsset?: ResolveAsset;
  baseUrl?: string;
}

function Triangle({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <path d={direction === 'left' ? 'M17 4v16L5 12z' : 'M7 4v16l12-8z'} fill="currentColor" />
    </svg>
  );
}

function NativeDateButton({ onPick }: { onPick: (date: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        className={styles.stripBtn}
        aria-label="Jump to date"
        onClick={() => {
          const input = inputRef.current;
          if (!input) return;
          // showPicker() needs a user gesture (this is one); older WebViews fall back to click().
          if (typeof input.showPicker === 'function') input.showPicker();
          else input.click();
        }}
      >
        <CalendarDays size={22} strokeWidth={1.6} />
      </button>
      {/* Rendered (so showPicker works) but invisible and out of the way. */}
      <input
        ref={inputRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        className={styles.nativeDate}
        onChange={(e) => {
          if (e.target.value) onPick(e.target.value);
        }}
      />
    </>
  );
}

type HistoryStatus = 'closed' | 'loading' | 'ready' | 'error';

export function EntryNavStrip({
  date,
  prevEntryId,
  nextEntryId,
  onNavigate,
  entries,
  onPickDate,
  loadHistory,
  resolveAsset,
  baseUrl,
}: EntryNavStripProps) {
  const tile = formatStripDate(date);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>('closed');
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  // Guards a slow response from a previous open landing after the user has closed/moved on.
  const historyRequest = useRef(0);

  const closeHistory = useCallback(() => {
    historyRequest.current++;
    setHistoryStatus('closed');
  }, []);

  // A different entry is a different history — never show the previous one's pop-down.
  useEffect(() => {
    closeHistory();
  }, [date, closeHistory]);

  useEffect(() => {
    if (historyStatus === 'closed') return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) closeHistory();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeHistory();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [historyStatus, closeHistory]);

  function toggleHistory() {
    if (!loadHistory) return;
    if (historyStatus !== 'closed') {
      closeHistory();
      return;
    }
    const id = ++historyRequest.current;
    setHistoryStatus('loading');
    loadHistory().then(
      (items) => {
        if (id !== historyRequest.current) return;
        setHistoryItems(items);
        setHistoryStatus('ready');
      },
      () => {
        if (id !== historyRequest.current) return;
        setHistoryStatus('error');
      },
    );
  }

  const calendar =
    entries && entries.length > 0 ? (
      <DatePicker
        entries={entries}
        currentDate={date}
        onNavigate={onNavigate}
        buttonClassName={styles.stripBtn}
        iconSize={22}
      />
    ) : onPickDate ? (
      <NativeDateButton onPick={onPickDate} />
    ) : null;

  return (
    <div className={styles.strip} ref={wrapperRef}>
      <div className={styles.tile} aria-label={`Entry date ${date}`}>
        {tile ? (
          <>
            <span className={styles.tileDay}>{tile.day}</span>
            <span className={styles.tileMonth}>{tile.monthYear}</span>
          </>
        ) : (
          <span className={styles.tileMonth}>{date}</span>
        )}
      </div>

      {calendar}

      {loadHistory && (
        <button
          type="button"
          className={styles.stripBtn}
          onClick={toggleHistory}
          aria-label="This day in other years"
          aria-expanded={historyStatus !== 'closed'}
        >
          <HistoryIcon size={22} strokeWidth={1.6} />
        </button>
      )}

      <button
        type="button"
        className={styles.stripBtn}
        onClick={() => prevEntryId && onNavigate(prevEntryId)}
        disabled={!prevEntryId}
        aria-label="Older entry"
      >
        <Triangle direction="left" />
      </button>
      <button
        type="button"
        className={styles.stripBtn}
        onClick={() => nextEntryId && onNavigate(nextEntryId)}
        disabled={!nextEntryId}
        aria-label="Newer entry"
      >
        <Triangle direction="right" />
      </button>

      {historyStatus !== 'closed' && (
        <div className={styles.historyPop} role="dialog" aria-label="This day in other years">
          {historyStatus === 'loading' && (
            <div className={styles.historyMsg}>
              <Loader2 size={18} strokeWidth={1.6} className={styles.spinner} />
            </div>
          )}
          {historyStatus === 'error' && (
            <div className={styles.historyMsg}>Couldn&rsquo;t load. Try again.</div>
          )}
          {historyStatus === 'ready' && historyItems.length === 0 && (
            <div className={styles.historyMsg}>No entries a year either side of this date.</div>
          )}
          {historyStatus === 'ready' &&
            historyItems.map((item) => (
              <button
                key={item.entryId}
                type="button"
                className={styles.historyItem}
                onClick={() => {
                  closeHistory();
                  onNavigate(item.entryId);
                }}
                aria-label={`${item.label}: ${item.date}`}
              >
                <span className={styles.historyThumb}>
                  <AsyncThumb
                    path={item.thumbnailPath}
                    syncSrc={
                      resolveAsset
                        ? undefined
                        : baseUrl
                          ? `${baseUrl}/${item.thumbnailPath}`
                          : item.thumbnailPath
                    }
                    resolveAsset={resolveAsset}
                    className={styles.historyThumbImg}
                  />
                </span>
                <span className={styles.historyLabel}>{item.label}</span>
                <span className={styles.historyDate}>{item.date}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
