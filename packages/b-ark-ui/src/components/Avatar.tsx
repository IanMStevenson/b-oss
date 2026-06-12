// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Electron container for the shared Avatar: binds the backend's cached-avatar
// loader (memoised per account so the kit only refetches when the account,
// remote URL, or refresh key changes); presentation lives in the kit.
import { useCallback } from 'react';
import { Avatar as AvatarView } from '@b-oss/b-ark-ui-components';
import { useApp } from '../context/AppContext.js';

interface AvatarProps {
  accountId: string;
  name: string;
  remoteUrl: string;
  refreshKey: string | null;
  size: number;
}

export function Avatar({ accountId, name, remoteUrl, refreshKey, size }: AvatarProps) {
  const { backend } = useApp();
  const loadAvatar = useCallback(() => backend.getAccountAvatar(accountId), [backend, accountId]);
  return (
    <AvatarView
      name={name}
      remoteUrl={remoteUrl}
      refreshKey={refreshKey}
      size={size}
      loadAvatar={loadAvatar}
    />
  );
}
