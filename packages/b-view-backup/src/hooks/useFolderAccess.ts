// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useCallback, useEffect, useRef } from 'react';

export async function getNestedFileHandle(
  dir: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemFileHandle> {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  let current: FileSystemDirectoryHandle = dir;
  for (let i = 0; i < parts.length - 1; i++) {
    current = await current.getDirectoryHandle(parts[i]);
  }
  return current.getFileHandle(parts[parts.length - 1]);
}

export function useFolderAccess(dirHandle: FileSystemDirectoryHandle | null): {
  resolveAsset: (path: string) => Promise<string>;
} {
  const blobCache = useRef<Map<string, string>>(new Map());
  // Keep a ref to dirHandle so resolveAsset doesn't need to be recreated
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(dirHandle);
  dirHandleRef.current = dirHandle;

  // Revoke cached blob URLs and clear the cache when the folder changes
  useEffect(() => {
    return () => {
      for (const url of blobCache.current.values()) {
        URL.revokeObjectURL(url);
      }
      blobCache.current = new Map();
    };
  }, [dirHandle]);

  const resolveAsset = useCallback(async (path: string): Promise<string> => {
    const dir = dirHandleRef.current;
    if (!dir) throw new Error('No folder selected');
    const cached = blobCache.current.get(path);
    if (cached) return cached;
    const fileHandle = await getNestedFileHandle(dir, path);
    const file = await fileHandle.getFile();
    const url = URL.createObjectURL(file);
    blobCache.current.set(path, url);
    return url;
  }, []); // stable — reads dirHandle via ref at call time

  return { resolveAsset };
}
