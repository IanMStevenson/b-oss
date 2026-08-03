// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

/**
 * Same values as tokens.css, for contexts that need them in JS/TS rather than as CSS custom
 * properties (e.g. an Ionic theme mapping). Keep in sync with tokens.css by hand — there are few
 * enough values that generating one from the other isn't worth the build step.
 */
export const tokens = {
  green900: '#143729',
  green800: '#1f4d3a',
  green700: '#2a6347',
  green100: '#eef2ee',
  green50: '#f6f8f6',
  ink: '#111111',
  ink2: '#2a2a2a',
  muted: '#6b7280',
  muted2: '#9ca3af',
  line: '#e5e7eb',
  line2: '#eeeeee',
  bg: '#ffffff',
  bgAlt: '#fafafa',
  photoBg: '#f0f0f0',
  colorDanger: '#d04545',
} as const;

export type TokenName = keyof typeof tokens;
