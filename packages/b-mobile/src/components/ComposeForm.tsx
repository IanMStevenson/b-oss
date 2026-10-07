// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Form building blocks for the compose / edit-entry flow (UX review X5, b-oss#270). Same visual
// language as Settings > Notifications (16px gutters, grey captions, IonItem rows with right-hand
// controls) but with the field itself drawn as a rounded box under its label, so a label never
// touches the field above. Inputs stay native <input>/<textarea> (soft-keyboard behaviour, and
// `getByDisplayValue` in jsdom) — only their chrome is styled, in ComposeForm.css.

import type { ReactNode } from 'react';
import { IonItem, IonToggle } from '@ionic/react';
import { ChevronRight } from 'lucide-react';
import './ComposeForm.css';

interface FieldProps {
  label: string;
  value: string;
  maxLength?: number;
  /** Small grey line under the field (hint or remaining-characters count). */
  caption?: string | null;
  onChange: (value: string) => void;
}

/** Single-line text field: label above, rounded box below. */
export function TextField({ label, value, maxLength, caption, onChange }: FieldProps) {
  return (
    <label className="compose-field">
      <span className="compose-field-label">{label}</span>
      <input
        type="text"
        className="compose-field-input"
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
      />
      {caption && <span className="compose-field-caption">{caption}</span>}
    </label>
  );
}

interface FormRowProps {
  label: string;
  /** Right-aligned secondary text / preview shown under the label. */
  summary?: string;
  onClick: () => void;
}

/** A tappable field that opens another screen (e.g. the description editor): label, one-line
 * preview, chevron. */
export function LinkRow({ label, summary, onClick }: FormRowProps) {
  return (
    <button type="button" className="compose-link-row" onClick={onClick}>
      <span className="compose-link-text">
        <span className="compose-field-label">{label}</span>
        <span className="compose-link-summary">{summary}</span>
      </span>
      <ChevronRight size={20} aria-hidden="true" className="compose-link-chevron" />
    </button>
  );
}

interface ToggleRowProps {
  label: string;
  caption?: string | null;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Extra content under the label, e.g. a "Change" action. */
  children?: ReactNode;
}

/** Boolean option: label (+ caption) left, toggle right — the same row Settings uses. */
export function ToggleRow({ label, caption, checked, onChange, children }: ToggleRowProps) {
  return (
    <IonItem lines="none" className="compose-toggle-row">
      <div className="compose-toggle-text">
        <span>{label}</span>
        {caption && <span className="compose-field-caption">{caption}</span>}
        {children}
      </div>
      <IonToggle
        slot="end"
        aria-label={label}
        checked={checked}
        onIonChange={(e) => onChange(e.detail.checked)}
      />
    </IonItem>
  );
}
