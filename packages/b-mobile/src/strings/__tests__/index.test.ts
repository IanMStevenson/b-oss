// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// §19 layer 1 — t()'s interpolation logic is the one hand-written piece of the copy deck; the
// generated deck.ts itself is data, not logic, so it isn't tested here.

import { describe, expect, it } from 'vitest';
import { t } from '../index.js';

describe('t', () => {
  it('returns the draft text unchanged when there is nothing to interpolate', () => {
    expect(t('CONFIRM.delete_entry.title')).toBe('Delete this entry?');
  });

  it('fills in a {placeholder} token from vars', () => {
    expect(t('CONFIRM.hide.title', { username: 'alex' })).toBe('Hide alex?');
  });

  it('fills in every occurrence of a repeated token', () => {
    expect(t('CONFIRM.delete_comment.moderation.title', { username: 'alex' })).toBe(
      "Delete alex's comment from your journal?",
    );
  });

  it('leaves an unmatched token as-is rather than dropping it', () => {
    expect(t('CONFIRM.hide.title', {})).toBe('Hide {username}?');
  });

  it('preserves embedded newlines from multi-paragraph draft text', () => {
    expect(t('SCR-01.explainer.first_run.body')).toContain('\n\n');
  });
});
