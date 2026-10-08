// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Shared form building blocks for Settings (SCR-25) and Help & info (SCR-29), modelled on
// Settings > Notifications: IonItem rows, right-aligned toggles, a grey caption above each group,
// 16px gutters. UX review X5/X6/X9 (b-oss#272, #278). Label spans are plain <span>s rather than
// IonLabel for the same jsdom reason as the rest of the settings screens (RESUME.md).

import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  IonButton,
  IonDatetime,
  IonInput,
  IonItem,
  IonList,
  IonListHeader,
  IonNote,
  IonContent,
  IonHeader,
  IonModal,
  IonToolbar,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonSpinner,
  IonText,
  IonToggle,
} from '@ionic/react';
import { Check, ExternalLink } from 'lucide-react';

/** Grey section caption above a group of rows (same markup Notifications uses). */
export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <IonListHeader className="settings-section-header">
      <IonNote>{children}</IonNote>
    </IonListHeader>
  );
}

/** A small grey explanatory line inside a list, in its own row. */
export function CaptionRow({ children, tone }: { children: ReactNode; tone?: 'danger' }) {
  return (
    <IonItem lines="none" className="settings-caption-row">
      <IonText color={tone ?? 'medium'} className="ion-text-wrap">
        <p className="settings-caption">{children}</p>
      </IonText>
    </IonItem>
  );
}

interface TextFieldRowProps {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

/** Single-line text field: IonItem with the label stacked above the input. */
export function TextFieldRow({ label, value, disabled, onChange }: TextFieldRowProps) {
  return (
    <IonItem>
      <IonInput
        label={label}
        labelPlacement="stacked"
        value={value}
        disabled={disabled}
        onIonInput={(e) => onChange(String(e.detail.value ?? ''))}
      />
    </IonItem>
  );
}

interface SelectRowProps {
  label: string;
  /** Left-aligned title of the picker, on the same row as Cancel (e.g. 'Select country'). */
  pickerTitle: string;
  value: string;
  options: Array<{ code: string; title: string }>;
  disabled?: boolean;
  onChange: (value: string) => void;
}

/** Choice from a long list: a row showing the current choice that opens a modal list. The list is
 * sorted alphabetically, opens scrolled to the current choice with it highlighted, and has a
 * header with the title on the left and Cancel on the right. (IonSelect's modal interface can't
 * put a title beside Cancel or scroll to the selection, so this is a plain IonModal.) */
export function SelectRow({
  label,
  pickerTitle,
  value,
  options,
  disabled,
  onChange,
}: SelectRowProps) {
  const [open, setOpen] = useState(false);
  const selectedRef = useRef<HTMLIonItemElement | null>(null);
  const sorted = useMemo(
    () => [...options].sort((a, b) => a.title.localeCompare(b.title)),
    [options],
  );
  const current = options.find((o) => o.code === value);

  return (
    <>
      <IonItem button detail={false} disabled={disabled} onClick={() => setOpen(true)}>
        <div style={{ padding: '8px 0' }}>
          <IonNote style={{ display: 'block', fontSize: 12 }}>{label}</IonNote>
          <span>{current?.title ?? ''}</span>
        </div>
      </IonItem>
      <IonModal
        isOpen={open}
        onDidPresent={() => selectedRef.current?.scrollIntoView?.({ block: 'center' })}
        onDidDismiss={() => setOpen(false)}
      >
        <IonHeader>
          <IonToolbar>
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px 0 16px' }}>
              <h2 style={{ flex: 1, margin: 0, fontSize: 18, fontWeight: 600 }}>{pickerTitle}</h2>
              <IonButton fill="clear" onClick={() => setOpen(false)}>
                Cancel
              </IonButton>
            </div>
          </IonToolbar>
        </IonHeader>
        <IonContent>
          <IonList>
            {sorted.map((o) => {
              const selected = o.code === value;
              return (
                <IonItem
                  key={o.code}
                  ref={selected ? selectedRef : undefined}
                  button
                  detail={false}
                  color={selected ? 'light' : undefined}
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => {
                    setOpen(false);
                    if (!selected) onChange(o.code);
                  }}
                >
                  <span style={{ fontWeight: selected ? 600 : undefined }}>{o.title}</span>
                  {selected && <Check slot="end" size={18} aria-hidden="true" />}
                </IonItem>
              );
            })}
          </IonList>
        </IonContent>
      </IonModal>
    </>
  );
}

interface SegmentRowProps<T extends string> {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

/** Choice between a few short options: the label above a lozenge (pill) segment, so it reads as a
 * choice rather than as tab navigation. The one segment style for settings. */
export function SegmentRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentRowProps<T>) {
  return (
    <>
      <IonItem lines="none" style={{ '--min-height': '36px' }}>
        <span>{label}</span>
      </IonItem>
      <IonSegment
        className="settings-pill-segment"
        aria-label={label}
        value={value}
        onIonChange={(e) => onChange(e.detail.value as T)}
      >
        {options.map((o) => (
          <IonSegmentButton key={o.value} value={o.value}>
            <IonLabel>{o.label}</IonLabel>
          </IonSegmentButton>
        ))}
      </IonSegment>
    </>
  );
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

interface TimeRowProps {
  label: string;
  pickerTitle: string;
  hour: number;
  minute: number;
  /** Minutes the wheel offers (e.g. [0, 15, 30, 45]). */
  minuteValues?: number[];
  disabled?: boolean;
  onChange: (time: { hour: number; minute: number }) => void;
}

/** Time of day: a row showing the current time (24h, e.g. 20:00) that opens a wheel time picker
 * in a modal with Cancel / Done, matching SelectRow's header. */
export function TimeRow({
  label,
  pickerTitle,
  hour,
  minute,
  minuteValues,
  disabled,
  onChange,
}: TimeRowProps) {
  const [open, setOpen] = useState(false);
  const current = `${pad2(hour)}:${pad2(minute)}`;
  const [pending, setPending] = useState(current);

  function done(): void {
    setOpen(false);
    const [h, m] = pending.split(':').map(Number);
    if (h !== undefined && m !== undefined && pending !== current) onChange({ hour: h, minute: m });
  }

  return (
    <>
      <IonItem
        button
        detail={false}
        disabled={disabled}
        onClick={() => {
          setPending(current);
          setOpen(true);
        }}
      >
        <div style={{ padding: '8px 0' }}>
          <IonNote style={{ display: 'block', fontSize: 12 }}>{label}</IonNote>
          <span>{current}</span>
        </div>
      </IonItem>
      <IonModal isOpen={open} onDidDismiss={() => setOpen(false)}>
        <IonHeader>
          <IonToolbar>
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px 0 16px' }}>
              <h2 style={{ flex: 1, margin: 0, fontSize: 18, fontWeight: 600 }}>{pickerTitle}</h2>
              <IonButton fill="clear" onClick={() => setOpen(false)}>
                Cancel
              </IonButton>
              <IonButton fill="clear" onClick={done}>
                Done
              </IonButton>
            </div>
          </IonToolbar>
        </IonHeader>
        <IonContent>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
            <IonDatetime
              aria-label={label}
              presentation="time"
              preferWheel
              hourCycle="h23"
              minuteValues={minuteValues}
              value={pending}
              onIonChange={(e) => {
                if (typeof e.detail.value === 'string') {
                  const m = /(\d{2}):(\d{2})/.exec(e.detail.value);
                  if (m) setPending(`${m[1]}:${m[2]}`);
                }
              }}
            />
          </div>
        </IonContent>
      </IonModal>
    </>
  );
}

interface ToggleRowProps {
  label: string;
  caption?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

/** Boolean option: label (+ optional one-line caption) left, toggle right. */
export function ToggleRow({ label, caption, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <IonItem>
      <div className="settings-toggle-text">
        <span>{label}</span>
        {caption && <p className="settings-caption">{caption}</p>}
      </div>
      <IonToggle
        slot="end"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onIonChange={(e) => onChange(e.detail.checked)}
      />
    </IonItem>
  );
}

interface NavRowProps {
  label: string;
  /** Right-aligned secondary value, shown before the chevron. */
  value?: string;
  /** `push` shows a chevron; `external` shows an external-link icon (leaves the app). */
  kind: 'push' | 'external';
  onClick: () => void;
}

/** A row that goes somewhere, with the affordance saying where. */
export function NavRow({ label, value, kind, onClick }: NavRowProps) {
  return (
    <IonItem button detail={kind === 'push'} onClick={onClick}>
      <span>{label}</span>
      {value && <IonNote slot="end">{value}</IonNote>}
      {kind === 'external' && (
        <ExternalLink slot="end" size={18} aria-hidden="true" className="settings-external-icon" />
      )}
    </IonItem>
  );
}

interface ActionRowProps {
  label: string;
  busy?: boolean;
  disabled?: boolean;
  /** Destructive action: red label. */
  danger?: boolean;
  onClick: () => void;
}

/** A row that does something in place (no navigation): label, optional spinner at the end. */
export function ActionRow({ label, busy, disabled, danger, onClick }: ActionRowProps) {
  return (
    <IonItem button detail={false} disabled={disabled} onClick={onClick}>
      <span style={danger ? { color: 'var(--ion-color-danger)' } : undefined}>{label}</span>
      {busy && <IonSpinner slot="end" name="dots" />}
    </IonItem>
  );
}

interface FormActionsProps {
  saving: boolean;
  /** Save stays disabled until something changed. */
  dirty: boolean;
  onSave: () => void;
  onCancel: () => void;
}

/** The one Save/Cancel pattern for the server-backed settings forms: a full-width primary pill
 * with a quiet Cancel beneath, always in the same place under the last field. */
export function FormActions({ saving, dirty, onSave, onCancel }: FormActionsProps) {
  return (
    <div className="settings-actions">
      <IonButton expand="block" disabled={saving || !dirty} onClick={onSave}>
        {saving ? <IonSpinner name="dots" /> : 'Save'}
      </IonButton>
      <IonButton expand="block" fill="clear" disabled={saving} onClick={onCancel}>
        Cancel
      </IonButton>
    </div>
  );
}
