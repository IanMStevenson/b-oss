// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useEffect, useState } from 'react';

interface AvatarProps {
  name: string;
  remoteUrl: string;
  /** Refetch trigger — pass `account.last_backup_at` so the cached file is
   *  re-read after every backup. */
  refreshKey: string | null;
  size: number;
  /** Resolve the locally-cached avatar (e.g. a `data:` URL), or `null` if none.
   *  Memoise on the caller so the effect only refetches when the account
   *  changes. */
  loadAvatar: () => Promise<string | null>;
}

const COLOURS = ['#1f4d3a', '#2a6347', '#22a06b', '#2f6fd1', '#9333ea'];

function pickColour(name: string): string {
  return COLOURS[name.charCodeAt(0) % COLOURS.length] ?? '#1f4d3a';
}

export function Avatar({ name, remoteUrl, refreshKey, size, loadAvatar }: AvatarProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setImgError(false);
    loadAvatar()
      .then((dataUrl) => {
        if (cancelled) return;
        if (dataUrl) setSrc(dataUrl);
        else if (remoteUrl.trim()) setSrc(remoteUrl);
        else setSrc(null);
      })
      .catch(() => {
        if (cancelled) return;
        setSrc(remoteUrl.trim() ? remoteUrl : null);
      });
    return () => {
      cancelled = true;
    };
  }, [loadAvatar, refreshKey, remoteUrl]);

  if (src === null || imgError) {
    const initial = (name[0] ?? '?').toUpperCase();
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: pickColour(name),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: size * 0.4,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      onError={() => setImgError(true)}
    />
  );
}
