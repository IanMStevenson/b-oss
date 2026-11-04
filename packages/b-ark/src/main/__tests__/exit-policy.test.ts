// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it, vi } from 'vitest';
import {
  ABORT_WARNING,
  SCHEDULED_EXIT_WARNING,
  decideTrayExit,
  decideWindowClose,
  resolveTrayExit,
  resolveWindowClose,
  type ExitDialogs,
} from '../exit-policy.js';

const dialogs = (answer: boolean) => {
  const confirm = vi.fn<ExitDialogs['confirm']>().mockResolvedValue(answer);
  return { confirm };
};

describe('decideWindowClose', () => {
  it.each([
    [true, false, 'hide'],
    [true, true, 'hide'],
    [false, false, 'exit'],
    [false, true, 'ask-abort'],
  ] as const)('scheduled=%s running=%s -> %s', (scheduled, backupRunning, want) => {
    expect(decideWindowClose({ scheduled, backupRunning })).toBe(want);
  });
});

describe('decideTrayExit', () => {
  it.each([
    [true, false, 'confirm'],
    [true, true, 'ask-abort'],
    [false, false, 'exit'],
    [false, true, 'ask-abort'],
  ] as const)('scheduled=%s running=%s -> %s', (scheduled, backupRunning, want) => {
    expect(decideTrayExit({ scheduled, backupRunning })).toBe(want);
  });
});

describe('resolveWindowClose', () => {
  it('hides without asking when scheduled', async () => {
    const d = dialogs(true);
    expect(await resolveWindowClose({ scheduled: true, backupRunning: true }, d)).toBe('hide');
    expect(d.confirm).not.toHaveBeenCalled();
  });
  it('exits without asking when not scheduled and idle', async () => {
    const d = dialogs(true);
    expect(await resolveWindowClose({ scheduled: false, backupRunning: false }, d)).toBe('exit');
    expect(d.confirm).not.toHaveBeenCalled();
  });
  it('asks when a backup runs; Abort and Exit exits, Continue Backup stays', async () => {
    const ctx = { scheduled: false, backupRunning: true };
    const yes = dialogs(true);
    expect(await resolveWindowClose(ctx, yes)).toBe('exit');
    expect(yes.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: ABORT_WARNING,
        confirmLabel: 'Abort and Exit',
        cancelLabel: 'Continue Backup',
      }),
    );
    expect(await resolveWindowClose(ctx, dialogs(false))).toBe('stay');
  });
});

describe('resolveTrayExit', () => {
  it('quits silently when not scheduled and idle', async () => {
    const d = dialogs(false);
    expect(await resolveTrayExit({ scheduled: false, backupRunning: false }, d)).toBe(true);
    expect(d.confirm).not.toHaveBeenCalled();
  });
  it('confirms with the scheduled warning when scheduled and idle', async () => {
    const d = dialogs(true);
    expect(await resolveTrayExit({ scheduled: true, backupRunning: false }, d)).toBe(true);
    expect(d.confirm).toHaveBeenCalledOnce();
    expect(d.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: SCHEDULED_EXIT_WARNING,
        confirmLabel: 'Exit',
        cancelLabel: 'Cancel',
      }),
    );
    expect(await resolveTrayExit({ scheduled: true, backupRunning: false }, dialogs(false))).toBe(
      false,
    );
  });
  it('shows ONE combined dialog when scheduled and a backup is running', async () => {
    const d = dialogs(true);
    expect(await resolveTrayExit({ scheduled: true, backupRunning: true }, d)).toBe(true);
    expect(d.confirm).toHaveBeenCalledOnce();
    expect(d.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: ABORT_WARNING, detail: SCHEDULED_EXIT_WARNING }),
    );
  });
  it('abort-only dialog has no scheduled detail when not scheduled', async () => {
    const d = dialogs(false);
    expect(await resolveTrayExit({ scheduled: false, backupRunning: true }, d)).toBe(false);
    expect(d.confirm.mock.calls[0]?.[0].detail).toBeUndefined();
  });
});
