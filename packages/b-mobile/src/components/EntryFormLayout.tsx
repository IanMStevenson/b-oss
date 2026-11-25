// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The shared layout of the new-entry and edit-entry screens (b-oss#1043), following the website's:
// the photo across the top, then the date and the extra photos, then the entry details, then the
// action. In one column that is the order down the page; when wide (theme/wideLayout.ts) the
// details sit on the left and the date and extras on the right, with the action across the bottom.
// The slots are plain nodes, so each screen keeps its own fields and behaviour.

import type { ReactNode } from 'react';
import './EntryFormLayout.css';

interface Props {
  /** Banners and errors that sit above everything. */
  notices?: ReactNode;
  photo?: ReactNode;
  /** The date control. */
  date?: ReactNode;
  /** The extra photos block. */
  extras?: ReactNode;
  /** Title, description, tags, map. */
  details: ReactNode;
  /** The Publish / Save button and anything that goes with it. */
  action: ReactNode;
}

export function EntryFormLayout({ notices, photo, date, extras, details, action }: Props) {
  return (
    <div className="entry-form">
      {notices && <div className="entry-form-notices">{notices}</div>}
      {photo && <div className="entry-form-photo">{photo}</div>}
      {(date || extras) && (
        <div className="entry-form-side">
          {date}
          {extras}
        </div>
      )}
      <div className="entry-form-main">{details}</div>
      <div className="entry-form-action">{action}</div>
    </div>
  );
}
