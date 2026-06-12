// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// AES-GCM encrypted token storage — stub; implemented fully in the next commit.

export interface StoredToken {
  accessToken: string;
  username: string;
}

export function storeToken(_token: StoredToken): Promise<void> {
  return Promise.reject(new Error('not yet implemented'));
}

export function loadToken(): Promise<StoredToken | null> {
  return Promise.resolve(null);
}

export function clearToken(): Promise<void> {
  return Promise.resolve();
}
