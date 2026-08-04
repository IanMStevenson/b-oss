// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/geolocation: current position, permission state (§13). Permission is
// requested at the point of use (map my-location control, Nearby feed, location picker) —
// never on screen entry.
// TODO(Phase 6): implement against @capacitor/geolocation.

export interface Coordinates {
  lat: number;
  lon: number;
}

export function getCurrentPosition(): Promise<Coordinates | null> {
  return Promise.reject(new Error('platform/geolocation.ts: not implemented until Phase 6'));
}
