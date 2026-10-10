// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { CapacitorConfig } from '@capacitor/cli';

// Application ID is permanent once first uploaded to Play (app-architecture.md §17).
const config: CapacitorConfig = {
  appId: 'uk.co.salientpoint.bmobile',
  appName: 'b-mobile',
  webDir: 'dist',
  // Capacitor's default ('debug') logs every native bridge call with its arguments in debug
  // builds: Authorization headers, the registration body and secret, SecureStorage values. That
  // all lands in logcat (b-oss#241). 'none' also silences the app's own console logs on device.
  loggingBehavior: 'none',
};

export default config;
