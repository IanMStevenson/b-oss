// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { CapacitorConfig } from '@capacitor/cli';

// Application ID is adequate for development and review; revisit before a first Play
// submission, since it is permanent from that point on (app-architecture.md §17, Q2).
const config: CapacitorConfig = {
  appId: 'io.github.ianmstevenson.bmobile',
  appName: 'b-mobile',
  webDir: 'dist',
};

export default config;
