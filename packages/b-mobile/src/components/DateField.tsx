// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-10's date control, compact: a single "Date" row showing the chosen day, which expands to the
// month grid (MonthDatePicker, unchanged semantics: eligibility per day from journal/month) and
// collapses again once a day is picked. The old always-open calendar took ~40% of the screen
// (UX review 46, b-oss#270). The picker mounts on first open and is then kept (hidden when
// collapsed) so a month's eligibility is fetched once per visit, not once per expand.

import { useState } from 'react';
import { CalendarDays, ChevronDown, ChevronUp } from 'lucide-react';
import { MonthDatePicker } from './MonthDatePicker.js';
import './ComposeForm.css';

interface DateFieldProps {
  /** 'YYYY-MM-DD' */
  value: string;
  onChange: (date: string) => void;
}

export function formatDateLabel(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function DateField({ value, onChange }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);

  function toggle(): void {
    setOpen((o) => !o);
    setEverOpened(true);
  }

  return (
    <div className="compose-field">
      <span className="compose-field-label">Date</span>
      <button
        type="button"
        className="date-field-row"
        aria-expanded={open}
        aria-label={`Date: ${formatDateLabel(value)}`}
        onClick={toggle}
      >
        <CalendarDays size={20} aria-hidden="true" color="var(--green-800)" />
        <span className="date-field-value">{formatDateLabel(value)}</span>
        {open ? (
          <ChevronUp size={20} aria-hidden="true" color="var(--muted)" />
        ) : (
          <ChevronDown size={20} aria-hidden="true" color="var(--muted)" />
        )}
      </button>
      {everOpened && (
        <div className="date-field-picker" hidden={!open}>
          <MonthDatePicker
            value={value}
            onChange={(date) => {
              onChange(date);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
