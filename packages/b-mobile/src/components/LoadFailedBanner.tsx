// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The compact "couldn't load" notice for a screen that stays usable underneath it — the map keeps
// its tiles and any markers already shown (b-oss#754). Same wording as the full-pane LoadFailed,
// shared via useLoadDiagnosis; `hint` replaces the diagnosis-specific line when the caller has a
// better one (e.g. "Move the map to try again.").

import { CloudOff, WifiOff } from 'lucide-react';
import { useLoadDiagnosis } from './useLoadDiagnosis.js';

interface LoadFailedBannerProps {
  transport: boolean;
  message?: string;
  /** Appended on its own line, e.g. how to try again. */
  action?: string;
  /** Overrides the "Couldn't load" title for a non-transport failure. */
  title?: string;
}

export function LoadFailedBanner({ transport, message, action, title }: LoadFailedBannerProps) {
  const d = useLoadDiagnosis(transport, message);
  const Icon = d.diagnosis === 'offline' ? WifiOff : CloudOff;
  return (
    <div className="load-failed-banner" role="alert">
      <Icon size={22} strokeWidth={1.75} aria-hidden="true" />
      <div>
        <p className="load-failed-banner-title">
          {d.diagnosis === 'other' && title ? title : d.title}
        </p>
        <p className="load-failed-banner-hint">{d.hint}</p>
        {action && <p className="load-failed-banner-hint">{action}</p>}
      </div>
    </div>
  );
}
