// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Star,
  Heart,
  MapPin,
  Camera,
  Timer,
  Aperture,
  Ruler,
  SunMedium,
} from 'lucide-react';
import type { BlipEntry, BlipComment, EntryIndex } from '../types.js';
import type { EntryState } from '../hooks/useEntry.js';
import { DatePicker } from './DatePicker.js';
import styles from './EntryDetail.module.css';

type ResolveAsset = (path: string) => Promise<string> | string;

function ordinalSuffix(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return 'th';
  switch (day % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

function formatLongDate(isoDate: string): string {
  // Parse as local time (not UTC) so the calendar date doesn't shift in negative-offset locales.
  const d = new Date(isoDate + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return isoDate;
  const day = d.getDate();
  const month = d.toLocaleDateString('en-GB', { month: 'long' });
  return `${day}${ordinalSuffix(day)} ${month} ${d.getFullYear()}`;
}

interface EntryDetailProps {
  entryState: EntryState;
  prevEntryId: string | null;
  nextEntryId: string | null;
  onNavigate: (entryId: string) => void;
  onClose?: () => void;
  baseUrl?: string;
  resolveAsset?: ResolveAsset;
  entries?: EntryIndex[];
}

function ExifRows({ exif }: { exif: NonNullable<BlipEntry['exif']> }) {
  const rows: { icon: React.ReactNode; value: string | null }[] = [
    { icon: <Camera size={14} strokeWidth={1.5} />, value: exif.camera },
    { icon: <Timer size={14} strokeWidth={1.5} />, value: exif.exposure_time },
    {
      icon: <Aperture size={14} strokeWidth={1.5} />,
      value: exif.f_number ? `f/${exif.f_number}` : null,
    },
    { icon: <Ruler size={14} strokeWidth={1.5} />, value: exif.focal_length },
    { icon: <SunMedium size={14} strokeWidth={1.5} />, value: exif.iso ? String(exif.iso) : null },
  ].filter((r) => r.value !== null);
  return (
    <div className={styles.exifRows}>
      {rows.map((r, i) => (
        <div key={i} className={styles.exifRow}>
          <span className={styles.exifIcon}>{r.icon}</span>
          <span className={styles.exifValue}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function CommentThread({ comment }: { comment: BlipComment }) {
  return (
    <div className={styles.comment}>
      <span className={styles.commentAuthor}>{comment.commenter_username}</span>
      {comment.content_html ? (
        <div
          className={styles.commentBody}
          dangerouslySetInnerHTML={{ __html: comment.content_html }}
        />
      ) : (
        <div className={styles.commentBody}>{comment.content}</div>
      )}
      {comment.replies && comment.replies.length > 0 && (
        <div className={styles.replies}>
          {comment.replies.map((reply) => (
            <CommentThread key={reply.comment_id} comment={reply} />
          ))}
        </div>
      )}
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
  resolveAsset,
  entries,
}: EntryDetailProps) {
  const [asyncImageSrc, setAsyncImageSrc] = useState<string | null>(null);

  const imagePath =
    entryState.status === 'loaded'
      ? (entryState.data.images.image ?? entryState.data.images.thumbnail ?? null)
      : null;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && prevEntryId) onNavigate(prevEntryId);
      if (e.key === 'ArrowRight' && nextEntryId) onNavigate(nextEntryId);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [prevEntryId, nextEntryId, onNavigate]);

  useEffect(() => {
    if (!resolveAsset || !imagePath) {
      setAsyncImageSrc(null);
      return;
    }
    let cancelled = false;
    void Promise.resolve(resolveAsset(imagePath)).then((url) => {
      if (!cancelled) setAsyncImageSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [resolveAsset, imagePath]);

  const syncImageSrc =
    !resolveAsset && imagePath ? (baseUrl ? `${baseUrl}/${imagePath}` : imagePath) : null;

  const imageSrc = resolveAsset ? asyncImageSrc : syncImageSrc;

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

  return (
    <div className={styles.wrapper}>
      {/* Navigation header */}
      <div className={styles.navHeader}>
        <div className={styles.navLeft}>
          {onClose && (
            <button className={styles.navBtn} onClick={onClose} aria-label="Back to grid">
              <ArrowLeft size={16} strokeWidth={1.6} />
              <span style={{ fontSize: '12px' }}>Back</span>
            </button>
          )}
          <button
            className={styles.navBtn}
            onClick={() => prevEntryId && onNavigate(prevEntryId)}
            disabled={!prevEntryId}
            aria-label="Older entry"
          >
            <ChevronLeft size={18} strokeWidth={1.6} />
          </button>
        </div>

        <div className={styles.navTitle}>
          {entries && entries.length > 0 && (
            <DatePicker entries={entries} currentDate={entry.date} onNavigate={onNavigate} />
          )}
          <span className={styles.navHeading}>
            {formatLongDate(entry.date)}
            {entry.title && ` : ${entry.title}`}
          </span>
        </div>

        <div className={styles.navRight}>
          <button
            className={styles.navBtn}
            onClick={() => nextEntryId && onNavigate(nextEntryId)}
            disabled={!nextEntryId}
            aria-label="Newer entry"
          >
            <ChevronRight size={18} strokeWidth={1.6} />
          </button>
        </div>
      </div>

      {/* Photo */}
      <div className={styles.photoOuter}>
        <div className={styles.photoMiddle}>
          {imageSrc && (
            <div className={styles.photoInner}>
              <img src={imageSrc} alt={entry.title} className={styles.photo} />
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
          )}
        </div>
      </div>

      {/* Below-image content */}
      <div className={styles.metaScroll}>
        <div className={styles.metaInner}>
          {/* Title repeated below image */}
          {entry.title && <h2 className={styles.entryTitle}>{entry.title}</h2>}

          <div className={styles.metaColumns}>
            {/* Left column: description, tags, comments */}
            <div className={styles.metaLeft}>
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

              {entry.comments.length > 0 && (
                <div className={styles.commentsSection}>
                  <h3 className={styles.commentsHeader}>Comments ({entry.comments.length})</h3>
                  {entry.comments.map((c) => (
                    <CommentThread key={c.comment_id} comment={c} />
                  ))}
                </div>
              )}
            </div>

            {/* Right column: views, stars, hearts, location, EXIF */}
            <div className={styles.metaRight}>
              {/* Views */}
              {entry.views_total > 0 && (
                <div className={styles.viewsBlock}>
                  <span className={styles.viewCount}>{entry.views_total.toLocaleString()}</span>
                  <span className={styles.viewLabel}>views</span>
                </div>
              )}

              {/* Stars + hearts */}
              <div className={styles.reactionsRow}>
                <span className={styles.reactionItem}>
                  <Star size={14} strokeWidth={1.5} />
                  {entry.stars_total}
                </span>
                <span className={styles.reactionItem}>
                  <Heart size={14} strokeWidth={1.5} />
                  {entry.favorites_total}
                </span>
                {entry.location && (
                  <a
                    className={styles.reactionItem}
                    href={`https://maps.google.com/maps?q=${entry.location.lat},${entry.location.lon}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="View on map"
                  >
                    <MapPin size={14} strokeWidth={1.5} />
                  </a>
                )}
              </div>

              {/* EXIF */}
              {entry.exif && <ExifRows exif={entry.exif} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
