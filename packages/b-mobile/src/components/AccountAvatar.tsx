// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// One account's identity mark, shared by the header indicator and the account switcher: the
// Blipfoto profile picture, or — when the account has none, or the device setting asks for icons
// (Settings → Misc → Account picture) — the generic user icon on the brand green.

import { User } from 'lucide-react';
import { CachedImage } from './CachedImage.js';
import { useDevicePrefsStore } from '../state/devicePrefsStore.js';

// Square like every other profile picture (b-oss#827), except the header indicator, which passes
// `round` — a round account button is the convention for an account menu and square looked wrong there.
export function AccountAvatar({
  avatarUrl,
  size,
  round = false,
}: {
  avatarUrl: string | null;
  size: number;
  round?: boolean;
}) {
  const borderRadius = round ? '50%' : undefined;
  const style = useDevicePrefsStore((s) => s.accountAvatarStyle);
  if (avatarUrl && style === 'picture') {
    return (
      <CachedImage
        src={avatarUrl}
        alt=""
        style={{ width: size, height: size, objectFit: 'cover', borderRadius, flexShrink: 0 }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius,
        background: 'var(--brand-fill)',
        color: 'var(--on-brand-fill)',
        flexShrink: 0,
      }}
    >
      <User size={Math.round(size * 0.6)} strokeWidth={1.8} />
    </span>
  );
}
