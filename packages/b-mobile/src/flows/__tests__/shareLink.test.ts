// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// b-oss#417: the URLs and text a share carries, and the rule for "this journal is protected".

import { describe, it, expect } from 'vitest';
import {
  entryShareUrl,
  profileShareUrl,
  entryShareText,
  profileShareText,
  isJournalProtected,
} from '../shareLink.js';

const details = (privacy: 0 | 1) => ({
  journal_title: 'J',
  biography: '',
  biography_html: '',
  country_code: 'GB',
  entry_total: 1,
  member: 0 as const,
  privacy,
});

describe('share URLs', () => {
  it('builds the public entry and profile links', () => {
    expect(entryShareUrl('123')).toBe('https://www.blipfoto.com/entry/123');
    expect(profileShareUrl('alice')).toBe('https://www.blipfoto.com/alice');
  });

  it('encodes path segments', () => {
    expect(profileShareUrl('a b/c')).toBe('https://www.blipfoto.com/a%20b%2Fc');
  });
});

describe('share text', () => {
  it('names the entry title and author, or falls back for an untitled entry', () => {
    expect(entryShareText('Sunrise', 'alice')).toBe('Sunrise by alice');
    expect(entryShareText('  ', 'alice')).toBe('Entry by alice');
    expect(entryShareText(null, 'alice')).toBe('Entry by alice');
  });

  it('names the journal, or falls back to the username when it has no title', () => {
    expect(profileShareText("Alice's journal", 'alice')).toBe("Alice's journal on Blipfoto");
    expect(profileShareText(undefined, 'alice')).toBe('alice on Blipfoto');
  });
});

describe('isJournalProtected', () => {
  it('is protected when the owner flag says so', () => {
    expect(isJournalProtected({ details: details(1), visible: true })).toBe(true);
  });

  it('is protected when the viewer cannot see it, even with no details to read', () => {
    expect(isJournalProtected({ details: null, visible: false })).toBe(true);
  });

  it('is open when visible and not flagged', () => {
    expect(isJournalProtected({ details: details(0), visible: true })).toBe(false);
  });
});
