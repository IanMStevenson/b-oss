// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The Windows AppUserModelID. Toast notifications are only reliably shown for an app whose ID matches
// the Start Menu shortcut it was installed with, and the NSIS installer creates that shortcut with the
// build's `appId` (electron-builder.json). A test keeps the two equal.
export const APP_USER_MODEL_ID = 'co.salientpoint.b-mobile-pc';
