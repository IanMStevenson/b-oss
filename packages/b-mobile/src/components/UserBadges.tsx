// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The small badge-icon row Blipfoto's own website renders next to a username (camera/client
// type, member level, subscriber status, etc.) — `BlipUser.icons`, real API data. Currently
// wired into SCR-24 (Comments) only, the one screen this round's feedback covered in detail;
// the same `icons` array is available anywhere a `BlipUser` is, so extending this to profile
// headers, entry authorship, and notification rows later is a matter of rendering this
// component, not fetching new data.

import type { BlipUser } from '@b-oss/b-api';

interface UserBadgesProps {
  icons: BlipUser['icons'] | undefined;
  size?: number;
}

export function UserBadges({ icons, size = 16 }: UserBadgesProps) {
  if (!icons || icons.length === 0) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 3, verticalAlign: 'middle' }}>
      {icons.map((icon) => (
        <img
          key={icon.icon_id}
          src={icon.icon_url}
          alt=""
          width={size}
          height={size}
          style={{ borderRadius: '50%' }}
        />
      ))}
    </span>
  );
}
