// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// One account's identity mark, shared by the header indicator and the account switcher: the
// Blipfoto profile picture, or — when the account has none, or the device setting asks for icons
// (Settings → Misc → Account picture) — the generic user icon on the brand green.

import { User } from 'lucide-react';
import { CachedImage } from './CachedImage.js';
import { useDevicePrefsStore } from '../state/devicePrefsStore.js';

export function AccountAvatar({ avatarUrl, size }: { avatarUrl: string | null; size: number }) {
  const style = useDevicePrefsStore((s) => s.accountAvatarStyle);
  if (avatarUrl && style === 'picture') {
    return (
      <CachedImage
        src={avatarUrl}
        alt=""
        style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0 }}
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
        borderRadius: '50%',
        background: 'var(--green-800, #1f4d3a)',
        color: '#fff',
        flexShrink: 0,
      }}
    >
      <User size={Math.round(size * 0.6)} strokeWidth={1.8} />
    </span>
  );
}
