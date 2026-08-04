// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-25's General section: country/locale picker options. rules.md calls these out as the one
// deliberate exception to "no data is cached for display" — "static reference data for form
// pickers, not user content" — so, unlike every other data/*.ts fetcher in this app, these two
// are cached in memory for the life of the app rather than refetched on every visit. Verified
// against b-api's actual client.ts (not assumed from the method name): both `getCountries()`/
// `getLocales()` already exist, hit `config/countries`/`config/locales`, and need no auth — an
// anonymous client (getClient() falls back to one automatically) is fine.

import { getClient } from './client.js';

export interface ConfigOption {
  code: string;
  title: string;
}

let countriesPromise: Promise<ConfigOption[]> | null = null;
let localesPromise: Promise<ConfigOption[]> | null = null;

export function fetchCountries(): Promise<ConfigOption[]> {
  if (!countriesPromise) {
    countriesPromise = getClient()
      .then((client) => client.getCountries())
      .then((res) => res.countries.map((c) => ({ code: c.country_code, title: c.title })))
      .catch((err: unknown) => {
        // A failed fetch shouldn't wedge the cache forever — the next picker open retries.
        countriesPromise = null;
        throw err;
      });
  }
  return countriesPromise;
}

export function fetchLocales(): Promise<ConfigOption[]> {
  if (!localesPromise) {
    localesPromise = getClient()
      .then((client) => client.getLocales())
      .then((res) => res.locales.map((l) => ({ code: l.locale_code, title: l.title })))
      .catch((err: unknown) => {
        localesPromise = null;
        throw err;
      });
  }
  return localesPromise;
}
