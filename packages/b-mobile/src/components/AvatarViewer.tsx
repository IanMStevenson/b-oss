// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Full-size view of a profile picture (b-oss#825). The avatar is only ever shown at 48px; tapping
// it on a profile opens this plain fixed-position backdrop + image — the same approach as
// AccountSwitcherOverlay, not IonModal. The image shows at its natural size (the API gives one
// avatar_url, about 300x300) and is only ever shrunk to fit the screen, never enlarged.
// Tap anywhere (or Escape) to close.

import { useEffect } from 'react';
import { CachedImage } from './CachedImage.js';

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
    return () => window.removeEventListener('keydown', onKey);
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
          borderRadius: 12,
          background: 'var(--bg, #fff)',
        }}
      />
    </div>
  );
}
