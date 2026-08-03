// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

export { useJournal } from './hooks/useJournal.js';
export type { JournalState } from './hooks/useJournal.js';
export { useEntry } from './hooks/useEntry.js';
export { useFolderAccess, getNestedFileHandle } from './hooks/useFolderAccess.js';
export { useFolderEntry } from './hooks/useFolderEntry.js';
export { useFolderJournal } from './hooks/useFolderJournal.js';
export { useSearchEntries } from './hooks/useSearchEntries.js';
export type { SearchStatus, SearchState } from './hooks/useSearchEntries.js';
export type { JournalMetadata } from '@b-oss/backup-engine';
