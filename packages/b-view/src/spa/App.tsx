// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useState } from 'react';
import { Info } from 'lucide-react';
import { useJournal } from '../hooks/useJournal.js';
import { useEntry } from '../hooks/useEntry.js';
import { ThumbnailGrid } from '../components/ThumbnailGrid.js';
import { EntryDetail } from '../components/EntryDetail.js';
import { InfoPopup } from '../components/InfoPopup.js';

interface HeaderProps {
  journalTitle: string;
  onInfoClick: () => void;
}

function Header({ journalTitle, onInfoClick }: HeaderProps) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        height: '48px',
        padding: '0 20px',
        background: 'var(--green-800)',
        color: '#fff',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontSize: '17px',
          fontWeight: 700,
          letterSpacing: '-0.01em',
          whiteSpace: 'nowrap',
        }}
      >
        b-view
      </span>
      <span
        style={{
          flex: 1,
          textAlign: 'center',
          fontSize: '13px',
          color: 'rgba(255,255,255,0.65)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          padding: '0 16px',
        }}
      >
        {journalTitle}
      </span>
      <button
        onClick={onInfoClick}
        aria-label="About b-view"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          opacity: 0.8,
          padding: '4px',
          borderRadius: '4px',
        }}
      >
        <Info size={16} strokeWidth={1.6} />
      </button>
    </header>
  );
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const embedded = params.get('embedded') === 'true';

  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [sizePercent, setSizePercent] = useState(100);

  const journal = useJournal();
  const entryIndex = journal.status === 'loaded' ? journal.data.entries : [];
  const journalTitle = journal.status === 'loaded' ? journal.data.journal_title : '';

  const selectedIndex = entryIndex.findIndex((e) => e.entry_id === selectedEntryId);
  const prevEntry = selectedIndex > 0 ? entryIndex[selectedIndex - 1] : null;
  const nextEntry =
    selectedIndex >= 0 && selectedIndex < entryIndex.length - 1
      ? entryIndex[selectedIndex + 1]
      : null;

  const entry = useEntry(
    selectedEntryId
      ? (entryIndex.find((e) => e.entry_id === selectedEntryId)?.json_path ?? null)
      : null,
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {!embedded && <Header onInfoClick={() => setInfoOpen(true)} journalTitle={journalTitle} />}

      <main
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {journal.status === 'loading' && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--muted)',
            }}
          >
            Loading…
          </div>
        )}

        {journal.status === 'error' && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--rag-red)',
              padding: '24px',
              textAlign: 'center',
              maxWidth: '480px',
              margin: '0 auto',
            }}
          >
            {journal.message}
          </div>
        )}

        {journal.status === 'loaded' &&
          (selectedEntryId === null ? (
            <ThumbnailGrid
              entries={entryIndex}
              selectedEntryId={null}
              onSelectEntry={setSelectedEntryId}
              sizePercent={sizePercent}
              onSizeChange={setSizePercent}
            />
          ) : (
            <EntryDetail
              entryState={entry}
              prevEntryId={prevEntry?.entry_id ?? null}
              nextEntryId={nextEntry?.entry_id ?? null}
              onNavigate={setSelectedEntryId}
              onClose={() => setSelectedEntryId(null)}
            />
          ))}
      </main>

      <InfoPopup isOpen={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}
