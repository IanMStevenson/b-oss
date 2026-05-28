// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays } from 'lucide-react';
import type { EntryIndex } from '../types.js';
import styles from './DatePicker.module.css';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface DatePickerProps {
  entries: EntryIndex[];
  currentDate: string | null;
  onNavigate: (entryId: string) => void;
}

export function DatePicker({ entries, currentDate, onNavigate }: DatePickerProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
  const [viewYear, setViewYear] = useState<number | null>(null);
  const [viewMonth, setViewMonth] = useState<number | null>(null);

  const years = useMemo(
    () => [...new Set(entries.map((e) => parseInt(e.date.slice(0, 4))))].sort((a, b) => b - a),
    [entries],
  );

  const monthsInYear = useMemo(() => {
    if (viewYear === null) return [];
    return [
      ...new Set(
        entries
          .filter((e) => parseInt(e.date.slice(0, 4)) === viewYear)
          .map((e) => parseInt(e.date.slice(5, 7))),
      ),
    ].sort((a, b) => a - b);
  }, [entries, viewYear]);

  const entryDateMap = useMemo(() => new Map(entries.map((e) => [e.date, e.entry_id])), [entries]);

  // When viewYear changes, reset viewMonth to the first valid month for that year
  useEffect(() => {
    if (viewYear === null) return;
    setViewMonth((current) => {
      const months = [
        ...new Set(
          entries
            .filter((e) => parseInt(e.date.slice(0, 4)) === viewYear)
            .map((e) => parseInt(e.date.slice(5, 7))),
        ),
      ].sort((a, b) => a - b);
      if (current !== null && months.includes(current)) return current;
      return months[0] ?? null;
    });
  }, [viewYear, entries]);

  function handleOpen() {
    const d = currentDate ?? entries[0]?.date ?? null;
    if (d) {
      setViewYear(parseInt(d.slice(0, 4)));
      setViewMonth(parseInt(d.slice(5, 7)));
    } else if (years.length > 0) {
      setViewYear(years[0] ?? null);
    }
    setOpen(true);
  }

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPopupPos({
      top: rect.bottom + 4,
      left: Math.min(rect.left, window.innerWidth - 268),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const calendarCells = useMemo(() => {
    if (viewYear === null || viewMonth === null) return [];
    const firstDay = new Date(viewYear, viewMonth - 1, 1);
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const startOffset = (firstDay.getDay() + 6) % 7; // Mon=0 … Sun=6
    const cells: Array<{ type: 'pad' } | { type: 'day'; day: number; entryId: string | null }> = [];
    for (let i = 0; i < startOffset; i++) cells.push({ type: 'pad' });
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ type: 'day', day: d, entryId: entryDateMap.get(iso) ?? null });
    }
    return cells;
  }, [viewYear, viewMonth, entryDateMap]);

  const popup =
    open && viewYear !== null && viewMonth !== null ? (
      <div
        ref={popupRef}
        className={styles.popup}
        style={{ top: popupPos.top, left: popupPos.left }}
      >
        <div className={styles.selectors}>
          <select
            className={styles.select}
            value={viewYear}
            onChange={(e) => setViewYear(parseInt(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            value={viewMonth}
            onChange={(e) => setViewMonth(parseInt(e.target.value))}
          >
            {monthsInYear.map((m) => (
              <option key={m} value={m}>
                {MONTH_NAMES[m - 1]}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.weekHeader}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <span key={i} className={styles.weekDay}>
              {d}
            </span>
          ))}
        </div>

        <div className={styles.calGrid}>
          {calendarCells.map((cell, i) => {
            if (cell.type === 'pad') return <span key={i} className={styles.dayPad} />;
            const iso = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
            const isSelected = iso === currentDate;
            if (cell.entryId !== null) {
              const entryId = cell.entryId;
              return (
                <button
                  key={i}
                  className={`${styles.day}${isSelected ? ` ${styles.daySelected}` : ''}`}
                  onClick={() => {
                    onNavigate(entryId);
                    setOpen(false);
                  }}
                >
                  {cell.day}
                </button>
              );
            }
            return (
              <span key={i} className={`${styles.day} ${styles.dayNoEntry}`}>
                {cell.day}
              </span>
            );
          })}
        </div>
      </div>
    ) : null;

  return (
    <>
      <button
        ref={anchorRef}
        className={styles.calBtn}
        onClick={handleOpen}
        aria-label="Jump to date"
        aria-expanded={open}
      >
        <CalendarDays size={14} strokeWidth={1.6} />
      </button>
      {popup !== null && createPortal(popup, document.body)}
    </>
  );
}
