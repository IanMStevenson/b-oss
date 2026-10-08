// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Form building blocks for the compose / edit-entry flow (UX review X5, b-oss#270). Same visual
// language as Settings > Notifications (16px gutters, grey captions, IonItem rows with right-hand
// controls) but with the field itself drawn as a rounded box under its label, so a label never
// touches the field above. Inputs stay native <input>/<textarea> (soft-keyboard behaviour, and
// `getByDisplayValue` in jsdom) — only their chrome is styled, in ComposeForm.css.

import type { ReactNode } from 'react';
import { IonItem, IonToggle } from '@ionic/react';
import { BBCodeField } from '@b-oss/b-view';
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

interface DescriptionFieldProps {
  value: string;
  onChange: (value: string) => void;
}

/** The entry description, inline: b-view's rich-text box (B / I / U / S / link toolbar) under a
 * label, as on blipfoto.com's Add new entry page. The value is BBCode. */
export function DescriptionField({ value, onChange }: DescriptionFieldProps) {
  return (
    <div className="compose-field">
      <span className="compose-field-label">Description</span>
      <BBCodeField
        value={value}
        onChange={onChange}
        ariaLabel="Description"
        placeholder="Describe this entry…"
      />
    </div>
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
