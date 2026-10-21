// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The entry page's navigation strip — a dark date tile followed by flat square buttons: calendar,
// history, and solid ◀ ▶ — the strongest single style cue of blipfoto.com's entry page, and a
// large touch target on a phone. Replaces the old chevron row (b-oss#169, epic #167).
//
// Nothing here knows how to *find* entries: the host supplies the lookups it can actually do.
// The viewer has the whole journal locally (`entries` → the existing popup calendar); the app can
// asks the API month by month, so it supplies `loadCalendarMonth` / `loadHistory` — and a button
// the host can't back with data is simply not rendered.

import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, History as HistoryIcon, Loader2 } from 'lucide-react';
import type { EntryIndex } from '../types.js';
import { formatStripDate } from '../entryDates.js';
import { DatePicker } from './DatePicker.js';
import { EntryCalendar } from './EntryCalendar.js';
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
  /** Which days of a month (1–12) have an entry: day-of-month → entry id (the app). Opens a
   * month-grid calendar where only days with an entry are tappable. Ignored when `entries` is
   * given (the viewer keeps its own popup calendar). */
  loadCalendarMonth?: (year: number, month: number) => Promise<Record<number, string>>;
  /** The calendar's year dropdown starts here (default 2004, when Blipfoto launched). */
  calendarMinYear?: number;
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

type HistoryStatus = 'closed' | 'loading' | 'ready' | 'error';

export function EntryNavStrip({
  date,
  prevEntryId,
  nextEntryId,
  onNavigate,
  entries,
  loadCalendarMonth,
  calendarMinYear = 2004,
  loadHistory,
  resolveAsset,
  baseUrl,
}: EntryNavStripProps) {
  const tile = formatStripDate(date);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // At most one panel open at a time.
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>('closed');
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  // Guards a slow response from a previous open landing after the user has closed/moved on.
  const historyRequest = useRef(0);

  const closeHistory = useCallback(() => {
    historyRequest.current++;
    setHistoryStatus('closed');
  }, []);

  const closePanels = useCallback(() => {
    closeHistory();
    setCalendarOpen(false);
  }, [closeHistory]);

  // A different entry is a different history and a different month — never show the previous
  // entry's pop-down.
  useEffect(() => {
    closePanels();
  }, [date, closePanels]);

  const panelOpen = calendarOpen || historyStatus !== 'closed';
  useEffect(() => {
    if (!panelOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) closePanels();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanels();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [panelOpen, closePanels]);

  function toggleCalendar() {
    if (calendarOpen) {
      setCalendarOpen(false);
      return;
    }
    closeHistory();
    setCalendarOpen(true);
  }

  function toggleHistory() {
    if (!loadHistory) return;
    if (historyStatus !== 'closed') {
      closeHistory();
      return;
    }
    setCalendarOpen(false);
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
    ) : loadCalendarMonth ? (
      <button
        type="button"
        className={styles.stripBtn}
        onClick={toggleCalendar}
        aria-label="Jump to date"
        aria-expanded={calendarOpen}
      >
        <CalendarDays size={22} strokeWidth={1.6} />
      </button>
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

      {calendarOpen && loadCalendarMonth && (
        <div className={styles.pop} role="dialog" aria-label="Calendar">
          <EntryCalendar
            date={date}
            loadMonth={loadCalendarMonth}
            onSelect={(entryId) => {
              setCalendarOpen(false);
              onNavigate(entryId);
            }}
            minYear={calendarMinYear}
            maxYear={new Date().getFullYear()}
          />
        </div>
      )}

      {historyStatus !== 'closed' && (
        <div
          className={`${styles.pop} ${styles.historyPop}`}
          role="dialog"
          aria-label="This day in other years"
        >
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
