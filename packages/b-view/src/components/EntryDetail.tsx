// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { Fragment, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Eye,
  Star,
  Heart,
  MessageSquare,
} from 'lucide-react';
import type { BlipEntry } from '../types.js';
import type { EntryState } from '../hooks/useEntry.js';
import styles from './EntryDetail.module.css';

interface EntryDetailProps {
  entryState: EntryState;
  prevEntryId: string | null;
  nextEntryId: string | null;
  onNavigate: (entryId: string) => void;
  onClose?: () => void;
  baseUrl?: string;
}

type ExifKey = 'camera' | 'exposure_time' | 'f_number' | 'focal_length' | 'iso';

const EXIF_LABELS: Record<ExifKey, string> = {
  camera: 'Camera',
  exposure_time: 'Exposure',
  f_number: 'Aperture',
  focal_length: 'Focal length',
  iso: 'ISO',
};

function ExifGrid({ exif }: { exif: NonNullable<BlipEntry['exif']> }) {
  const keys = (Object.keys(EXIF_LABELS) as ExifKey[]).filter((k) => exif[k] !== null);
  return (
    <div className={styles.exifGrid}>
      {keys.map((k) => (
        <Fragment key={k}>
          <span className={styles.exifLabel}>{EXIF_LABELS[k]}</span>
          <span className={styles.exifValue}>{exif[k]}</span>
        </Fragment>
      ))}
    </div>
  );
}

export function EntryDetail({
  entryState,
  prevEntryId,
  nextEntryId,
  onNavigate,
  onClose,
  baseUrl,
}: EntryDetailProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && prevEntryId) onNavigate(prevEntryId);
      if (e.key === 'ArrowRight' && nextEntryId) onNavigate(nextEntryId);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [prevEntryId, nextEntryId, onNavigate]);

  if (entryState.status === 'idle') return null;

  if (entryState.status === 'loading') {
    return (
      <div className={styles.centred}>
        <Loader2 size={32} strokeWidth={1.6} className={styles.spinner} />
      </div>
    );
  }

  if (entryState.status === 'error') {
    return (
      <div className={`${styles.centred} ${styles.errorState}`}>
        <AlertCircle size={20} strokeWidth={1.6} />
        <span>{entryState.message}</span>
      </div>
    );
  }

  const { data: entry } = entryState;

  const activeExifKeys = entry.exif
    ? (Object.keys(EXIF_LABELS) as ExifKey[]).filter((k) => entry.exif![k] !== null)
    : [];

  const statsItems = [
    { icon: <Eye size={13} strokeWidth={1.6} />, count: entry.views_total, label: 'views' },
    { icon: <Star size={13} strokeWidth={1.6} />, count: entry.stars_total, label: 'stars' },
    {
      icon: <Heart size={13} strokeWidth={1.6} />,
      count: entry.favorites_total,
      label: 'favourites',
    },
    {
      icon: <MessageSquare size={13} strokeWidth={1.6} />,
      count: entry.comments.length,
      label: 'comments',
    },
  ].filter((s) => s.count > 0);

  return (
    <div className={styles.wrapper}>
      <div className={styles.navHeader}>
        <div className={styles.navLeft}>
          {onClose && (
            <button className={styles.navBtn} onClick={onClose} aria-label="Back">
              <ArrowLeft size={16} strokeWidth={1.6} />
              <span style={{ fontSize: '12px' }}>Back</span>
            </button>
          )}
          <button
            className={styles.navBtn}
            onClick={() => prevEntryId && onNavigate(prevEntryId)}
            disabled={!prevEntryId}
            aria-label="Previous entry"
          >
            <ChevronLeft size={18} strokeWidth={1.6} />
          </button>
        </div>

        <div className={styles.navTitle}>
          <span className={styles.navDate}>{entry.date}</span>
          {entry.title && <span className={styles.navEntryTitle}>&ldquo;{entry.title}&rdquo;</span>}
        </div>

        <div className={styles.navRight}>
          <button
            className={styles.navBtn}
            onClick={() => nextEntryId && onNavigate(nextEntryId)}
            disabled={!nextEntryId}
            aria-label="Next entry"
          >
            <ChevronRight size={18} strokeWidth={1.6} />
          </button>
        </div>
      </div>

      <div className={styles.photoContainer}>
        {(() => {
          const path = entry.images.image ?? entry.images.thumbnail;
          if (!path) return null;
          const src = baseUrl ? `${baseUrl}/${path}` : path;
          return <img src={src} alt={entry.title} className={styles.photo} />;
        })()}
        <div
          className={`${styles.photoHalf} ${styles.photoHalfLeft}`}
          onClick={() => prevEntryId && onNavigate(prevEntryId)}
          aria-hidden="true"
        />
        <div
          className={`${styles.photoHalf} ${styles.photoHalfRight}`}
          onClick={() => nextEntryId && onNavigate(nextEntryId)}
          aria-hidden="true"
        />
      </div>

      <div className={styles.metaScroll}>
        <div className={styles.metaInner}>
          {entry.description_html && (
            <div
              className={styles.description}
              dangerouslySetInnerHTML={{ __html: entry.description_html }}
            />
          )}

          {entry.tags.length > 0 && (
            <div className={styles.tags}>
              {entry.tags.map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}
                </span>
              ))}
            </div>
          )}

          {statsItems.length > 0 && (
            <div className={styles.stats}>
              {statsItems.map((s) => (
                <span key={s.label} className={styles.statItem}>
                  {s.icon}
                  {s.count.toLocaleString()} {s.label}
                </span>
              ))}
            </div>
          )}

          {activeExifKeys.length > 0 &&
            entry.exif &&
            (activeExifKeys.length > 2 ? (
              <details className={styles.exifDetails}>
                <summary className={styles.exifSummary}>EXIF</summary>
                <ExifGrid exif={entry.exif} />
              </details>
            ) : (
              <div style={{ marginTop: '16px' }}>
                <ExifGrid exif={entry.exif} />
              </div>
            ))}

          {entry.location && (
            <div className={styles.location}>
              📍{' '}
              <a
                href={`https://maps.google.com/maps?q=${entry.location.lat},${entry.location.lon}`}
                target="_blank"
                rel="noreferrer"
              >
                {entry.location.lat}, {entry.location.lon}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
