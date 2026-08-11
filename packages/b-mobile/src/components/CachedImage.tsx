// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Displays an image through platform/imageCache.ts's resolve() (§10). Renders a placeholder
// while resolving and falls back to the remote URL if the cache layer fails — a cache miss must
// never become a broken image. On an actual load failure (network down, the image itself gone),
// falls back to the same muted image-glyph placeholder b-view's ThumbnailGrid uses for its own
// broken thumbnails, rather than the browser's native broken-image icon — "all screens should
// use the same placeholder when an image isn't available." b-view's own ThumbnailGrid/EntryDetail
// call resolveImage directly via their `resolveAsset` prop instead of this component; this is for
// everywhere else an image needs the same caching behaviour (avatars, notification images, etc.).

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { Image } from 'lucide-react';
import { resolveImage } from '../platform/imageCache.js';

interface CachedImageProps {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  loading?: 'lazy' | 'eager';
}

export function CachedImage({ src, alt, className, style, loading = 'lazy' }: CachedImageProps) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setResolvedSrc(null);
    setFailed(false);
    resolveImage(src).then(
      (resolved) => {
        if (!cancelled) setResolvedSrc(resolved);
      },
      () => {
        if (!cancelled) setResolvedSrc(src);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (failed) {
    return (
      <div
        className={className}
        style={{
          ...style,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-alt, #fafafa)',
        }}
        aria-hidden="true"
      >
        <Image size={20} strokeWidth={1.6} color="var(--muted-2, #9ca3af)" />
      </div>
    );
  }

  if (!resolvedSrc) {
    return <div className={className} style={style} aria-hidden="true" />;
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      style={style}
      loading={loading}
      onError={() => setFailed(true)}
    />
  );
}
