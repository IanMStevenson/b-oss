// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The one row anatomy for the inboxes (Notifications, Comments), Awards and — via UserRow — every
// people list (UX review X7/X8, b-oss#274/#271): a leading slot, the body, then trailing actions,
// on 16px gutters with a hairline. Styling lives in globals.css (`.inbox-row*`). `unread` hangs a
// green-800 dot in the left gutter, with "New" text for assistive tech.
//
// The shape rule: entries and award icons are 48px rounded squares (`RowThumb`), people are 40px
// circles (`RowAvatar`). A row's primary tap target (the leading image, a name) is wired by the
// caller, so each screen keeps its own aria-labels.

import type { ReactNode } from 'react';
import { CachedImage } from './CachedImage.js';

interface InboxRowProps {
  leading?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  unread?: boolean;
  /** Top-align leading/actions for multi-line bodies (comments); centre them for single lines. */
  align?: 'center' | 'top';
  style?: React.CSSProperties;
}

export function InboxRow({
  leading,
  children,
  actions,
  unread = false,
  align = 'center',
  style,
}: InboxRowProps) {
  return (
    <div
      className={align === 'top' ? 'inbox-row inbox-row-top' : 'inbox-row'}
      style={style}
      data-unread={unread ? 'true' : undefined}
    >
      {unread && (
        <>
          <span className="inbox-row-unread-dot" aria-hidden="true" />
          <span className="visually-hidden">New</span>
        </>
      )}
      {leading}
      <div className="inbox-row-body">{children}</div>
      {actions && <div className="inbox-row-actions">{actions}</div>}
    </div>
  );
}

/** 48px rounded square for an entry thumbnail or award icon; a plain placeholder tile if no url. */
export function RowThumb({ src }: { src: string | null | undefined }) {
  return src ? (
    <CachedImage src={src} alt="" className="inbox-row-thumb" />
  ) : (
    <div aria-hidden="true" className="inbox-row-thumb" />
  );
}

/** 40px circle for a person. */
export function RowAvatar({ src }: { src: string }) {
  return <CachedImage src={src} alt="" className="inbox-row-avatar" />;
}
