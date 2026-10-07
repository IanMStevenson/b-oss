// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-10's date picker: "the picker loads a month's eligibility at once rather than checking one
// date at a time" and "ineligible days are visibly unselectable". A plain `<input type="date">`
// can't grey out individual dates (no such native API), so this is a small custom month-grid
// instead — kept intentionally minimal (no year-jump, no localization beyond weekday initials)
// since a full calendar widget is more than this one screen needs. Fetches
// data/journal.ts's fetchMonthEligibility once per visited month (cached for the component's
// lifetime), never per date change, exactly matching the "without one request per date change"
// requirement.

import { useEffect, useRef, useState } from 'react';
import { IonSpinner } from '@ionic/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { fetchMonthEligibility } from '../data/journal.js';
import type { DayEligibility } from '../data/journal.js';
import { formatLocalDate, todayDate } from '../data/dates.js';
import './ComposeForm.css';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface MonthDatePickerProps {
  /** 'YYYY-MM-DD' */
  value: string;
  onChange: (date: string) => void;
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function MonthDatePicker({ value, onChange }: MonthDatePickerProps) {
  const selected = new Date(`${value}T00:00:00`);
  const [visibleYear, setVisibleYear] = useState(selected.getFullYear());
  const [visibleMonth, setVisibleMonth] = useState(selected.getMonth() + 1); // 1-indexed

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<Record<string, Record<string, DayEligibility>>>({});
  const [, forceRender] = useState(0);

  useEffect(() => {
    const key = monthKey(visibleYear, visibleMonth);
    if (cacheRef.current[key]) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchMonthEligibility(`${key}-01`).then(
      (map) => {
        if (cancelled) return;
        cacheRef.current[key] = map;
        setLoading(false);
        forceRender((n) => n + 1);
      },
      (err: unknown) => {
        if (cancelled) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : 'Could not load this month.');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [visibleYear, visibleMonth]);

  function changeMonth(delta: number): void {
    let month = visibleMonth + delta;
    let year = visibleYear;
    if (month < 1) {
      month = 12;
      year -= 1;
    } else if (month > 12) {
      month = 1;
      year += 1;
    }
    setVisibleYear(year);
    setVisibleMonth(month);
  }

  const map = cacheRef.current[monthKey(visibleYear, visibleMonth)];
  const total = daysInMonth(visibleYear, visibleMonth);
  const firstWeekday = new Date(visibleYear, visibleMonth - 1, 1).getDay();
  const cells: Array<{ date: string; day: number } | null> = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let day = 1; day <= total; day++) {
    cells.push({
      date: formatLocalDate(new Date(visibleYear, visibleMonth - 1, day)),
      day,
    });
  }

  const today = todayDate();

  return (
    <div>
      <div className="month-picker-head">
        <button
          type="button"
          className="month-picker-nav"
          aria-label="Previous month"
          onClick={() => changeMonth(-1)}
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <span>
          {new Date(visibleYear, visibleMonth - 1, 1).toLocaleDateString(undefined, {
            month: 'long',
            year: 'numeric',
          })}
        </span>
        <button
          type="button"
          className="month-picker-nav"
          aria-label="Next month"
          onClick={() => changeMonth(1)}
        >
          <ChevronRight size={22} aria-hidden="true" />
        </button>
      </div>

      {loading && <IonSpinner name="dots" />}
      {error && <p style={{ color: 'var(--color-danger, red)' }}>{error}</p>}

      {!loading && !error && (
        <div className="month-picker-grid">
          {WEEKDAY_LABELS.map((label, i) => (
            <div key={i} className="month-picker-weekday">
              {label}
            </div>
          ))}
          {cells.map((cell, i) => {
            if (!cell) return <div key={`pad-${i}`} />;
            const eligibility = map?.[cell.date];
            const publishable = eligibility?.publishable ?? true;
            const isSelected = cell.date === value;
            const classes = ['month-picker-day'];
            if (isSelected) classes.push('is-selected');
            if (cell.date === today) classes.push('is-today');
            return (
              <button
                key={cell.date}
                type="button"
                className={classes.join(' ')}
                // The selected day stays enabled even if the API calls it unavailable, so it
                // never reads as a disabled tile; the reason is shown under the date field and
                // gates Upload.
                disabled={!publishable && !isSelected}
                aria-label={`${cell.date}${publishable ? '' : ' (unavailable)'}`}
                aria-pressed={isSelected}
                onClick={() => onChange(cell.date)}
              >
                {cell.day}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
