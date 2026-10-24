// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Component state from check results (b-oss#476): Site = website checks + photo; API = API checks +
// photo. Photos failing therefore turns BOTH down. A component is Unknown when none of its own
// (non-photo) checks could run, so a lone photo result never stands in for a whole component.

import type { CheckId, CheckResult, Component, ComponentState, DerivedStates } from './types.js';

const OWN_CHECKS: Record<Component, readonly CheckId[]> = {
  site: ['website_browse', 'website_entry'],
  api: ['api_recent', 'api_entry'],
};

export function deriveComponent(component: Component, results: CheckResult[]): ComponentState {
  const own = results.filter((r) => OWN_CHECKS[component].includes(r.id));
  const photo = results.find((r) => r.id === 'photo');
  const ran = own.some((r) => r.status !== 'skipped');
  if (!ran) return { state: 'unknown', failed: [] };
  const failed = [...own, ...(photo ? [photo] : [])]
    .filter((r) => r.status === 'fail')
    .map((r) => r.id);
  return failed.length > 0 ? { state: 'down', failed } : { state: 'up', failed: [] };
}

export function deriveStates(results: CheckResult[]): DerivedStates {
  return { site: deriveComponent('site', results), api: deriveComponent('api', results) };
}
