// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Test helper: React Router 6 has no `<Router history={...}>` / createMemoryHistory(), so tests
// that assert where a screen navigated render a MemoryRouter with a <LocationTracker> inside and
// read `tracked.location` afterwards (same `.location.pathname` / `.location.state` shape the
// old history object exposed).

import { MemoryRouter, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';
import type { ReactNode } from 'react';

export interface TrackedHistory {
  location: Location;
}

function LocationTracker({ tracked }: { tracked: TrackedHistory }) {
  tracked.location = useLocation();
  return null;
}

export function createTrackedRouter(): {
  tracked: TrackedHistory;
  wrap: (children: ReactNode) => ReactNode;
} {
  const tracked: TrackedHistory = {
    location: { pathname: '/', search: '', hash: '', state: null, key: 'default' },
  };
  return {
    tracked,
    wrap: (children) => (
      <MemoryRouter>
        <LocationTracker tracked={tracked} />
        {children}
      </MemoryRouter>
    ),
  };
}
