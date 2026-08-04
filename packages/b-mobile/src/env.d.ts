// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BLIPFOTO_CLIENT_ID?: string;
  readonly VITE_OAUTH_REDIRECT_URI?: string;
  readonly VITE_NOTIFY_SERVICE_URL?: string;
  readonly VITE_NOTIFY_REGISTRATION_SECRET?: string;
  readonly VITE_MAP_TILES_KEY?: string;
}

declare const __APP_VERSION__: string;
declare const __RELEASE__: boolean;
