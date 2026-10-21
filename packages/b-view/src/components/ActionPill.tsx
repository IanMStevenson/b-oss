// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A small segmented pill of icon buttons — Blipfoto's idiom for a handful of related actions (the
// owner's edit | delete, a comment's reply | edit | delete | report). Icon-only, so each button
// carries its name in `aria-label` and `title`; text-labelled actions read as clutter at this size.

import type { ReactNode } from 'react';
import styles from './ActionPill.module.css';

export interface ActionPillItem {
  key: string;
  /** The action's name — its accessible label and its tooltip (there is no visible text). */
  label: string;
  icon: ReactNode;
  onClick: () => void;
  /** `danger` tints the icon red on hover — for a destructive action. */
  tone?: 'danger';
}

export function ActionPill({ items }: { items: ActionPillItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className={styles.pill} role="group">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`${styles.seg} ${item.tone === 'danger' ? styles.danger : ''}`}
          aria-label={item.label}
          title={item.label}
          onClick={item.onClick}
        >
          {item.icon}
        </button>
      ))}
    </div>
  );
}
