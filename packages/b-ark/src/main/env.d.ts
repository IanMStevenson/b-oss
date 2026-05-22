// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

/// <reference types="electron-vite/node" />

interface ImportMetaEnv {
  readonly MAIN_VITE_BLIPFOTO_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace Electron {
  interface App {
    isQuitting: boolean;
  }
}
