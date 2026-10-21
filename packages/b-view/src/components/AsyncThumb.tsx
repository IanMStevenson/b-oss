// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useEffect, useState } from 'react';

export type ResolveAsset = (path: string) => Promise<string> | string;

/** A thumbnail whose URL may need resolving asynchronously (b-mobile's cached/authenticated
 * image loader) or is already known synchronously (the viewer's relative path). Renders nothing
 * until a URL exists. */
export function AsyncThumb({
  path,
  syncSrc,
  resolveAsset,
  className,
}: {
  path: string;
  syncSrc: string | undefined;
  resolveAsset: ResolveAsset | undefined;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(syncSrc ?? null);
  useEffect(() => {
    if (!resolveAsset) return;
    let cancelled = false;
    void Promise.resolve(resolveAsset(path)).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [path, resolveAsset]);
  if (!src) return null;
  return <img src={src} alt="" className={className} />;
}
