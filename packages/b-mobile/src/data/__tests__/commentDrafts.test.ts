// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDraft,
  setDraft,
  clearDraft,
  clearAllDrafts,
  newCommentKey,
  replyKey,
  editKey,
} from '../commentDrafts.js';

beforeEach(clearAllDrafts);

describe('commentDrafts', () => {
  it('remembers text per target, independently', () => {
    setDraft(newCommentKey('e1'), 'new on e1');
    setDraft(newCommentKey('e2'), 'new on e2');
    setDraft(replyKey('c1'), 'reply to c1');
    setDraft(editKey('c1'), 'edit of c1');
    expect(getDraft(newCommentKey('e1'))).toBe('new on e1');
    expect(getDraft(newCommentKey('e2'))).toBe('new on e2');
    expect(getDraft(replyKey('c1'))).toBe('reply to c1');
    expect(getDraft(editKey('c1'))).toBe('edit of c1'); // a reply and an edit don't collide
  });

  it('treats empty or whitespace-only text as no draft', () => {
    setDraft(newCommentKey('e1'), 'something');
    setDraft(newCommentKey('e1'), '   ');
    expect(getDraft(newCommentKey('e1'))).toBeUndefined();
  });

  it('keeps meaningful whitespace inside a real draft', () => {
    setDraft(newCommentKey('e1'), 'line one\n\nline two  ');
    expect(getDraft(newCommentKey('e1'))).toBe('line one\n\nline two  ');
  });

  it('clears one draft without touching the others', () => {
    setDraft(newCommentKey('e1'), 'a');
    setDraft(newCommentKey('e2'), 'b');
    clearDraft(newCommentKey('e1'));
    expect(getDraft(newCommentKey('e1'))).toBeUndefined();
    expect(getDraft(newCommentKey('e2'))).toBe('b');
  });
});
