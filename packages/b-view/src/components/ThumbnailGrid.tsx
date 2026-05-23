// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, Image } from 'lucide-react';
import type { EntryIndex } from '../types.js';
import { Pagination } from './Pagination.js';
import styles from './ThumbnailGrid.module.css';

interface ThumbnailGridProps {
  entries: EntryIndex[];
  selectedEntryId: string | null;
  onSelectEntry: (entryId: string) => void;
  sizePercent?: number;
  onSizeChange?: (newPercent: number) => void;
  pageSize?: number;
  baseUrl?: string;
}

function ThumbnailItem({
  entry,
  selected,
  onSelect,
  baseUrl,
}: {
  entry: EntryIndex;
  selected: boolean;
  onSelect: () => void;
  baseUrl?: string;
}) {
  const [imgError, setImgError] = useState(false);
  const src = baseUrl ? `${baseUrl}/${entry.thumbnail_path}` : entry.thumbnail_path;

  return (
    <button
      onClick={onSelect}
      aria-label={entry.date}
      aria-pressed={selected}
      className={`${styles.thumb} ${selected ? styles.thumbSelected : ''}`}
    >
      {imgError ? (
        <div className={styles.thumbPlaceholder}>
          <Image size={20} strokeWidth={1.6} color="var(--muted-2)" />
        </div>
      ) : (
        <img
          src={src}
          alt={entry.title}
          loading="lazy"
          onError={() => setImgError(true)}
          className={styles.thumbImg}
        />
      )}
    </button>
  );
}

export function ThumbnailGrid({
  entries,
  selectedEntryId,
  onSelectEntry,
  sizePercent = 100,
  onSizeChange,
  pageSize = 60,
  baseUrl,
}: ThumbnailGridProps) {
  const [currentPage, setCurrentPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageEntries = entries.slice(pageStart, pageStart + pageSize);

  const cols = Math.round(Math.min(14, Math.max(4, 8 * (100 / sizePercent))));

  return (
    <div className={styles.container}>
      {onSizeChange && (
        <div className={styles.controls}>
          <button
            className={styles.iconBtn}
            onClick={() => onSizeChange(Math.max(30, sizePercent - 10))}
            aria-label="Zoom out"
          >
            <ZoomOut size={14} strokeWidth={1.6} />
          </button>
          <span className={styles.zoomLabel}>{sizePercent}%</span>
          <button
            className={styles.iconBtn}
            onClick={() => onSizeChange(Math.min(200, sizePercent + 10))}
            aria-label="Zoom in"
          >
            <ZoomIn size={14} strokeWidth={1.6} />
          </button>
          <button
            className={styles.iconBtn}
            onClick={() => onSizeChange(100)}
            aria-label="Reset zoom"
          >
            <RotateCcw size={14} strokeWidth={1.6} />
          </button>
        </div>
      )}

      <div className={styles.scroll}>
        <div
          className={styles.grid}
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {pageEntries.map((entry) => (
            <ThumbnailItem
              key={entry.entry_id}
              entry={entry}
              selected={entry.entry_id === selectedEntryId}
              onSelect={() => onSelectEntry(entry.entry_id)}
              baseUrl={baseUrl}
            />
          ))}
        </div>

        {totalPages > 1 && (
          <div className={styles.paginationRow}>
            <Pagination currentPage={safePage} totalPages={totalPages} onPage={setCurrentPage} />
          </div>
        )}
      </div>
    </div>
  );
}
