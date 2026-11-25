// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-23's app-style row (b-oss#1027), used for star, favourite and follow notifications whose
// actor can be read off the payload: the entry's thumbnail (the follower's picture for a follow),
// the member's name and badges as on the Comments inbox, the rest of the text, and an icon for the
// action on the right. Anything else is rendered by the screen's original row. The entry
// thumbnail and the badges are looked up lazily once the row is on screen and cached; until they
// arrive the row holds its size (a placeholder tile, no badges), and a failed thumbnail lookup
// falls back to the notification's own image.

import { useEffect, useRef, useState } from 'react';
import { Star, Heart, UserPlus } from 'lucide-react';
import { BBCodeText } from '@b-oss/b-view';
import type { BlipNotification, BlipUser } from '@b-oss/b-api';
import { InboxRow, RowThumb } from '../../components/InboxRow.js';
import { UserBadges } from '../../components/UserBadges.js';
import { useOnceVisible } from '../../components/useOnceVisible.js';
import { fetchEntryThumbnail } from '../../data/entries.js';
import { fetchUserBadges } from '../../data/users.js';
import type { NotificationKind } from '../../data/notifications.js';

interface NotificationRowProps {
  notification: BlipNotification;
  kind: NotificationKind;
  actor: { username: string; rest: string };
  /** Present for star and favourite; the entry whose thumbnail leads the row. */
  entryId: string | null;
  unread: boolean;
  onOpenEntry: (entryId: string) => void;
  onOpenProfile: (username: string) => void;
  onOpenLink: (href: string) => void;
}

const ACTION_LABEL: Record<NotificationKind, string> = {
  star: 'Star',
  favourite: 'Favourite',
  follow: 'New follower',
};

function ActionIcon({ kind }: { kind: NotificationKind }) {
  const props = { size: 20, strokeWidth: 1.5, 'aria-hidden': true } as const;
  if (kind === 'star') return <Star {...props} className="notif-icon-star" fill="currentColor" />;
  if (kind === 'favourite')
    return <Heart {...props} className="notif-icon-heart" fill="currentColor" />;
  return <UserPlus {...props} className="notif-icon-follow" />;
}

export function NotificationRow({
  notification,
  kind,
  actor,
  entryId,
  unread,
  onOpenEntry,
  onOpenProfile,
  onOpenLink,
}: NotificationRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = useOnceVisible(ref);
  const [thumb, setThumb] = useState<string | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [icons, setIcons] = useState<BlipUser['icons']>([]);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    void fetchUserBadges(actor.username)
      .then((found) => live && setIcons(found))
      .catch(() => {});
    if (entryId) {
      fetchEntryThumbnail(entryId)
        .then((url) => {
          if (!live) return;
          if (url) setThumb(url);
          else setThumbFailed(true);
        })
        .catch(() => live && setThumbFailed(true));
    }
    return () => {
      live = false;
    };
  }, [visible, actor.username, entryId]);

  // A follow keeps the follower's picture; a star/favourite shows the entry, falling back to the
  // payload's image only if the lookup fails.
  const leadingSrc = entryId
    ? thumbFailed
      ? notification.image_url
      : thumb
    : notification.image_url;

  // The leading image opens what it shows: the entry, or the member when it is a profile picture
  // (a follow, or a star/favourite whose entry thumbnail lookup failed).
  const leadingIsEntry = entryId !== null && !thumbFailed;

  return (
    <div ref={ref}>
      <InboxRow
        unread={unread}
        leading={
          <button
            onClick={() => (leadingIsEntry ? onOpenEntry(entryId) : onOpenProfile(actor.username))}
            aria-label={leadingIsEntry ? 'Open entry' : 'Open profile'}
            className="inbox-row-leading"
          >
            <RowThumb src={leadingSrc} />
          </button>
        }
        actions={
          <span role="img" aria-label={ACTION_LABEL[kind]} className="notif-icon">
            <ActionIcon kind={kind} />
          </span>
        }
      >
        <div className="notif-name-line">
          <button onClick={() => onOpenProfile(actor.username)} className="inbox-row-name">
            {actor.username}
          </button>
          <UserBadges icons={icons} />
        </div>
        <div style={{ marginTop: 2 }}>
          <BBCodeText source={actor.rest.trimStart()} onLinkClick={onOpenLink} />
        </div>
      </InboxRow>
    </div>
  );
}
