// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A month-grid calendar used purely for *navigation* (b-oss#169): days that have an entry are
// tappable and take you there; every other day is greyed out and inert. No "set"/"cancel"/"clear"
// — tapping a dated entry is the whole interaction. Modelled on blipfoto.com's own entry calendar.
//
// It owns no data: the host supplies `loadMonth`, because how you find out which days have entries
// is the host's business (the app asks the API; the viewer has everything locally and keeps its own
// popup calendar — see EntryNavStrip).

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import styles from './EntryCalendar.module.css';

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
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface EntryCalendarProps {
  /** `YYYY-MM-DD` of the entry on screen: highlighted, and the month the calendar opens on. */
  date: string;
  /** Day-of-month → entry id, for the days in that month (1–12) that have an entry. */
  loadMonth: (year: number, month: number) => Promise<Record<number, string>>;
  /** A tapped day that has an entry. */
  onSelect: (entryId: string) => void;
  /** The year dropdown's range. */
  minYear: number;
  maxYear: number;
}

type Status = 'loading' | 'ready' | 'error';

function parse(date: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
}

export function EntryCalendar({ date, loadMonth, onSelect, minYear, maxYear }: EntryCalendarProps) {
  const now = new Date();
  const current = parse(date) ?? { year: now.getFullYear(), month: now.getMonth() + 1, day: 0 };
  const [view, setView] = useState({ year: current.year, month: current.month });
  const [status, setStatus] = useState<Status>('loading');
  const [days, setDays] = useState<Record<number, string>>({});
  const [retry, setRetry] = useState(0);
  const request = useRef(0);

  useEffect(() => {
    const id = ++request.current;
    setStatus('loading');
    loadMonth(view.year, view.month).then(
      (result) => {
        if (id !== request.current) return;
        setDays(result);
        setStatus('ready');
      },
      () => {
        if (id !== request.current) return;
        setStatus('error');
      },
    );
    // loadMonth is a fresh closure each render of the host; the view/retry are what re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.year, view.month, retry]);

  function step(delta: number) {
    setView((v) => {
      const index = v.year * 12 + (v.month - 1) + delta;
      return { year: Math.floor(index / 12), month: (index % 12) + 1 };
    });
  }

  const atStart = view.year <= minYear && view.month === 1;
  const atEnd =
    view.year > now.getFullYear() ||
    (view.year === now.getFullYear() && view.month >= now.getMonth() + 1);

  // Monday-first: how many blank cells precede the 1st, and how many days the month has.
  const firstWeekday = (new Date(Date.UTC(view.year, view.month - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(view.year, view.month, 0)).getUTCDate();
  const cells: Array<number | null> = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const years: number[] = [];
  for (let y = maxYear; y >= minYear; y--) years.push(y);

  return (
    <div className={styles.calendar} aria-busy={status === 'loading'}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.step}
          onClick={() => step(-1)}
          disabled={atStart}
          aria-label="Previous month"
        >
          <ChevronLeft size={18} strokeWidth={1.8} />
        </button>
        <select
          className={styles.select}
          value={view.month}
          onChange={(e) => setView((v) => ({ ...v, month: Number(e.target.value) }))}
          aria-label="Month"
        >
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={i + 1}>
              {name}
            </option>
          ))}
        </select>
        <select
          className={styles.select}
          value={view.year}
          onChange={(e) => setView((v) => ({ ...v, year: Number(e.target.value) }))}
          aria-label="Year"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.step}
          onClick={() => step(1)}
          disabled={atEnd}
          aria-label="Next month"
        >
          <ChevronRight size={18} strokeWidth={1.8} />
        </button>
      </div>

      <div className={styles.weekdays} aria-hidden="true">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>

      <div className={styles.grid}>
        {cells.map((day, i) => {
          if (day === null) return <span key={`pad-${i}`} className={styles.pad} />;
          const entryId = status === 'ready' ? days[day] : undefined;
          const isSelected =
            day === current.day && view.year === current.year && view.month === current.month;
          const label = `${day} ${MONTH_NAMES[view.month - 1]} ${view.year}`;
          if (entryId) {
            return (
              <button
                key={day}
                type="button"
                className={`${styles.day} ${styles.hasEntry} ${isSelected ? styles.selected : ''}`}
                onClick={() => onSelect(entryId)}
                aria-label={label}
                aria-current={isSelected ? 'date' : undefined}
              >
                {day}
              </button>
            );
          }
          return (
            <span
              key={day}
              className={`${styles.day} ${styles.noEntry} ${isSelected ? styles.selected : ''}`}
              aria-disabled="true"
              aria-label={`${label}, no entry`}
            >
              {day}
            </span>
          );
        })}
        {status === 'loading' && (
          <div className={styles.overlay}>
            <Loader2 size={22} strokeWidth={1.6} className={styles.spinner} />
          </div>
        )}
        {status === 'error' && (
          <div className={styles.overlay}>
            <span>Couldn&rsquo;t load this month.</span>
            <button type="button" className={styles.retry} onClick={() => setRetry((n) => n + 1)}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
