// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Displays an image through platform/imageCache.ts's resolve() (§10). Renders a placeholder
// while resolving and falls back to the remote URL if the cache layer fails — a cache miss must
// never become a broken image. b-view's own ThumbnailGrid/EntryDetail call resolveImage directly
// via their `resolveAsset` prop instead of this component; this is for everywhere else an image
// needs the same caching behaviour outside those two components (avatars, notification images,
// etc., in later phases).

import { useEffect, useState } from 'react';
import { resolveImage } from '../platform/imageCache.js';

interface CachedImageProps {
  src: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
}

export function CachedImage({ src, alt, className, loading = 'lazy' }: CachedImageProps) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResolvedSrc(null);
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

  if (!resolvedSrc) {
    return <div className={className} aria-hidden="true" />;
  }

  return <img src={resolvedSrc} alt={alt} className={className} loading={loading} />;
}
