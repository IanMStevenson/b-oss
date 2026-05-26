// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

/**
 * Schema version for the portable b-ark-settings.json file. Lives in main
 * (not in b-ark-ui) so that importing it doesn't transitively pull in React
 * via the b-ark-ui package entry — main is loaded by Node ESM at runtime and
 * can't follow .ts imports from b-view.
 */
export const B_ARK_SETTINGS_SCHEMA_VERSION = 1 as const;
