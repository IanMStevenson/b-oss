// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Full-size view of a profile picture (b-oss#825). The avatar is only ever shown at 48px; tapping
// it on a profile opens this plain fixed-position backdrop + image — the same approach as
// AccountSwitcherOverlay, not IonModal. The image shows at its natural size (the API gives one
// avatar_url, about 300x300) and is only ever shrunk to fit the screen, never enlarged.
// Tap anywhere, Escape or the Android Back button closes it (Back is claimed via Ionic's
// `ionBackButton`, as BrowseBackGuard does, at a priority above it so Back doesn't leave the profile).

import { useEffect } from 'react';
import { CachedImage } from './CachedImage.js';

// Above BROWSE_BACK_PRIORITY (1); not calling processNextHandler stops the router going back.
const AVATAR_BACK_PRIORITY = 10;
interface BackButtonDetail {
  register: (priority: number, handler: (processNextHandler: () => void) => void) => void;
}

export function AvatarViewer({
  src,
  label,
  onDismiss,
}: {
  src: string;
  label: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    const onBack = (e: Event): void => {
      (e as CustomEvent<BackButtonDetail>).detail.register(AVATAR_BACK_PRIORITY, () => onDismiss());
    };
    document.addEventListener('ionBackButton', onBack);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('ionBackButton', onBack);
    };
  }, [onDismiss]);

  return (
    <div
      role="dialog"
      aria-label={label}
      onClick={onDismiss}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <CachedImage
        src={src}
        alt={label}
        loading="eager"
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          background: 'var(--bg, #fff)',
        }}
      />
    </div>
  );
}
