// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A non-fatal notice for a shell/web build mismatch (b-oss#696). Renders nothing on Android, iOS and
// the web, and nothing when the builds match.

import { useEffect, useState } from 'react';
import { logError } from '../platform/diagnostics.js';
import { checkShellBuild, mismatchLogLine, type ShellBuildCheck } from '../platform/shellBuild.js';

export function ShellBuildNotice() {
  const [mismatch, setMismatch] = useState<ShellBuildCheck | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void checkShellBuild().then((check) => {
      if (cancelled || check?.kind !== 'mismatch') return;
      logError({ source: 'shell-build', message: mismatchLogLine(check) });
      setMismatch(check);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!mismatch || dismissed) return null;
  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100000,
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        padding: '8px 12px',
        background: 'var(--bg-alt, #f4f1e8)',
        color: 'var(--ink, #222)',
        borderBottom: '2px solid var(--accent, #c60)',
        fontSize: 'var(--text-sm, 0.875rem)',
      }}
    >
      <span style={{ flex: 1 }}>
        b-mobile is running older program files than its web files (program {mismatch.shell}, web{' '}
        {mismatch.web}). Some things may not work. Quit b-mobile completely (tray icon, Exit) and
        start it again.
      </span>
      <button type="button" onClick={() => setDismissed(true)}>
        Dismiss
      </button>
    </div>
  );
}
