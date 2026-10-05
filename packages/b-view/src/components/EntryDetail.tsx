// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useEffect, useState, useCallback, type ReactNode } from 'react';
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Star,
  Heart,
  MapPin,
  Maximize2,
  Pencil,
  Trash2,
  Camera,
  Timer,
  Aperture,
  Ruler,
  SunMedium,
} from 'lucide-react';
import type { BlipEntry, BlipComment, EntryIndex, EntryState } from '../types.js';
import { EntryNavStrip, type HistoryItem } from './EntryNavStrip.js';
import { AsyncThumb, type ResolveAsset } from './AsyncThumb.js';
import { Lightbox } from './Lightbox.js';
import { BBCodeText } from './BBCodeText.js';
import { useSwipeNav } from '../useSwipeNav.js';
import styles from './EntryDetail.module.css';

interface EntryDetailReactions {
  starred: boolean;
  favorited: boolean;
  onToggleStar: () => void;
  onToggleFavorite: () => void;
}

interface EntryDetailProps {
  entryState: EntryState;
  prevEntryId: string | null;
  nextEntryId: string | null;
  onNavigate: (entryId: string) => void;
  onClose?: () => void;
  baseUrl?: string;
  resolveAsset?: ResolveAsset;
  /** Drops the host's cached copy of an image the browser failed to draw, so the one automatic
   * retry fetches it afresh (b-oss#185). Omitted: the retry just re-resolves. */
  invalidateAsset?: (path: string) => void | Promise<void>;
  entries?: EntryIndex[];
  /** Undefined: stars/hearts render as today's static counts. Provided: they become tappable. */
  reactions?: EntryDetailReactions;
  /** Rendered immediately after the comment list — the host owns the whole compose UI/behaviour. */
  commentComposer?: ReactNode;
  /** Rendered beside the nav strip — the host supplies edit/delete triggers for entries it owns. */
  entryActions?: ReactNode;
  /** Edit / delete for an entry the host's user owns, as Blipfoto's owner pill (✏ | 🗑). A segment
   * renders only when its handler is given, so a host that can't (or mustn't) delete simply omits
   * `onDelete`. Omitted entirely: no pill. */
  ownerActions?: { onEdit?: () => void; onDelete?: () => void };
  /** Rendered at the left of the top bar, opposite the nav strip — a host's own page identity
   * (b-mobile puts the author block here; the viewer has none). Stacks above the strip when the
   * container is narrow. */
  header?: ReactNode;
  /** Which days of a month have an entry (day-of-month → entry id) — opens a month-grid calendar
   * where only those days are tappable, for a host with no local entry list (b-mobile). Ignored
   * when `entries` is given (the popup calendar is used instead). */
  loadCalendarMonth?: (year: number, month: number) => Promise<Record<number, string>>;
  /** Loads the "1 year ago / 1 year ahead" entries for the history pop-down; omit to hide it. */
  loadHistory?: () => Promise<HistoryItem[]>;
  /** How the photo sizes against the screen. `full-width` (default) is blipfoto.com's own
   * behaviour: always the column width, however tall — a portrait photo runs past the bottom of
   * the screen and you scroll. `capped` limits the height so the whole picture fits without
   * scrolling, at the cost of a narrower photo. */
  photoFit?: 'full-width' | 'capped';
  /** Per-comment slot (e.g. reply/delete) — the host decides ownership, this component doesn't. */
  renderCommentActions?: (comment: BlipComment) => ReactNode;
  /** Per-comment: return a node to show an inline editor *in place of* that comment (its body and
   * actions are hidden while it's shown); return null for the normal comment. */
  renderCommentEditor?: (comment: BlipComment) => ReactNode;
  /** Per-comment: badges rendered beside the commenter's name (member level, client type…). */
  renderCommenterBadges?: (comment: BlipComment) => ReactNode;
  /** Makes each commenter's name a link; omitted, names are plain text. */
  onUserClick?: (username: string) => void;
  /** Per-comment: a node rendered beneath the comment and its actions, above its replies — an
   * inline reply composer. Null for none. */
  renderCommentReply?: (comment: BlipComment) => ReactNode;
  /** Forwarded to every internal BBCodeText (description + every comment/reply). Omitted: links
   * open via BBCodeText's own default (a new browser tab) — fine for Electron/Chrome, but a host
   * whose links must never navigate its own WebView away (e.g. a Capacitor system-browser open)
   * needs to supply this rather than relying on the default. */
  onLinkClick?: (href: string) => void;
  /** Called instead of opening the internal Lightbox overlay when the fullscreen button (next to
   * the reactions) is pressed — for a host with its own dedicated fullscreen-photo route/screen
   * to navigate to rather than overlay in place. Omitted: the default internal Lightbox opens, as
   * before. Extras thumbnails always still open the internal Lightbox regardless — this only
   * covers the main-photo fullscreen button. */
  onFullscreen?: () => void;
  /** Called when a tag chip is tapped, with the raw tag text — for a host that has a tag-entries
   * screen/route to navigate to. Omitted: tags render as plain, non-interactive text, as before. */
  onTagClick?: (tag: string) => void;
  /** Called instead of the default plain `<a target="_blank">` when the location pin (next to the
   * reactions) is pressed — for a host with its own map screen/route to navigate to internally
   * rather than opening an external maps site. Omitted: the default external link, as before —
   * accepted as a known WebView-navigation gap on native (b-mobile's own host now supplies this). */
  onLocationClick?: (location: { lat: number; lon: number }) => void;
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

function CommentThread({
  comment,
  renderCommentActions,
  renderCommentEditor,
  renderCommentReply,
  renderCommenterBadges,
  onUserClick,
  onLinkClick,
  resolveAsset,
  baseUrl,
}: {
  comment: BlipComment;
  renderCommentActions?: (comment: BlipComment) => ReactNode;
  renderCommentEditor?: (comment: BlipComment) => ReactNode;
  renderCommentReply?: (comment: BlipComment) => ReactNode;
  renderCommenterBadges?: (comment: BlipComment) => ReactNode;
  onUserClick?: (username: string) => void;
  onLinkClick?: (href: string) => void;
  resolveAsset?: ResolveAsset;
  baseUrl?: string;
}) {
  // An editor, when the host has one open for this comment, takes the place of the comment itself.
  const editor = renderCommentEditor?.(comment) ?? null;
  const reply = renderCommentReply?.(comment) ?? null;
  const avatar = comment.commenter_avatar;
  const shared = {
    renderCommentActions,
    renderCommentEditor,
    renderCommentReply,
    renderCommenterBadges,
    onUserClick,
    onLinkClick,
    resolveAsset,
    baseUrl,
  };
  return (
    <div className={styles.comment}>
      {/* An avatar column only when the host supplies avatars at all (the viewer doesn't). */}
      {avatar !== undefined && (
        <div className={styles.commentAvatar}>
          {avatar && (
            <AsyncThumb
              path={avatar}
              syncSrc={
                resolveAsset
                  ? undefined
                  : /^https?:/i.test(avatar) || !baseUrl
                    ? avatar
                    : `${baseUrl}/${avatar}`
              }
              resolveAsset={resolveAsset}
              className={styles.commentAvatarImg}
            />
          )}
        </div>
      )}
      <div className={styles.commentMain}>
        <div className={styles.commentHead}>
          {onUserClick ? (
            <button
              type="button"
              className={`${styles.commentAuthor} ${styles.commentAuthorLink}`}
              onClick={() => onUserClick(comment.commenter_username)}
            >
              {comment.commenter_username}
            </button>
          ) : (
            <span className={styles.commentAuthor}>{comment.commenter_username}</span>
          )}
          {renderCommenterBadges?.(comment)}
        </div>
        {editor ?? (
          <>
            <BBCodeText
              source={comment.content}
              className={styles.commentBody}
              onLinkClick={onLinkClick}
            />
            {renderCommentActions && (
              <div className={styles.commentActions}>{renderCommentActions(comment)}</div>
            )}
          </>
        )}
        {reply}
        {comment.replies && comment.replies.length > 0 && (
          <div className={styles.replies}>
            {comment.replies.map((r) => (
              <CommentThread key={r.comment_id} comment={r} {...shared} />
            ))}
          </div>
        )}
      </div>
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
  invalidateAsset,
  entries,
  reactions,
  commentComposer,
  entryActions,
  ownerActions,
  header,
  loadCalendarMonth,
  loadHistory,
  photoFit = 'full-width',
  renderCommentActions,
  renderCommentEditor,
  renderCommentReply,
  renderCommenterBadges,
  onUserClick,
  onLinkClick,
  onFullscreen,
  onTagClick,
  onLocationClick,
}: EntryDetailProps) {
  const [asyncImageSrc, setAsyncImageSrc] = useState<string | null>(null);
  // 0 = first load; 1 = the single automatic retry after the photo failed to draw.
  const [photoAttempt, setPhotoAttempt] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Resolved URLs for all lightbox images: [main, ...extras stdres]
  const [lightboxUrls, setLightboxUrls] = useState<string[]>([]);

  // Swipe follows the ◀ ▶ arrows in the nav header: the finger moves the way the arrow points
  // (swipe right = ▶ newer, swipe left = ◀ older) — the reverse of page-turn convention, which
  // read as backwards next to the arrows. Attached to the whole page (below), not just the photo,
  // and inert while the lightbox is open (it renders inside this wrapper, so its own swipes would
  // otherwise bubble up here and navigate the entry underneath it as well).
  const pageSwipe = useSwipeNav({
    onSwipeRight: () => lightboxIndex === null && nextEntryId && onNavigate(nextEntryId),
    onSwipeLeft: () => lightboxIndex === null && prevEntryId && onNavigate(prevEntryId),
  });

  const imagePath =
    entryState.status === 'loaded'
      ? (entryState.data.images.image ?? entryState.data.images.thumbnail ?? null)
      : null;

  const extras = entryState.status === 'loaded' ? (entryState.data.images.extras ?? []) : [];

  const resolveUrl = useCallback(
    (path: string): string | Promise<string> => {
      if (resolveAsset) return resolveAsset(path);
      return baseUrl ? `${baseUrl}/${path}` : path;
    },
    [resolveAsset, baseUrl],
  );

  // Resolve all lightbox URLs whenever entry or resolveAsset changes
  useEffect(() => {
    if (entryState.status !== 'loaded') return;
    const entry = entryState.data;
    const mainPath = entry.images.image ?? entry.images.thumbnail ?? null;
    const extraPaths = (entry.images.extras ?? []).map((e) => e.image ?? e.thumbnail ?? null);
    const allPaths = [mainPath, ...extraPaths].filter((p): p is string => p !== null);
    let cancelled = false;
    void Promise.all(allPaths.map((p) => Promise.resolve(resolveUrl(p)))).then((urls) => {
      if (!cancelled) setLightboxUrls(urls);
    });
    return () => {
      cancelled = true;
    };
  }, [entryState, resolveUrl]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only handle entry navigation keys when lightbox is closed
      if (lightboxIndex !== null) return;
      if (e.key === 'ArrowLeft' && prevEntryId) onNavigate(prevEntryId);
      if (e.key === 'ArrowRight' && nextEntryId) onNavigate(nextEntryId);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [prevEntryId, nextEntryId, onNavigate, lightboxIndex]);

  useEffect(() => {
    if (!resolveAsset || !imagePath) {
      setAsyncImageSrc(null);
      return;
    }
    let cancelled = false;
    if (photoAttempt > 0) setAsyncImageSrc(null); // show the loading state while it refetches
    void Promise.resolve(resolveAsset(imagePath)).then((url) => {
      if (!cancelled) setAsyncImageSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [resolveAsset, imagePath, photoAttempt]);

  // A different photo starts with its retry available again.
  useEffect(() => {
    setPhotoAttempt(0);
  }, [imagePath]);

  // Reset lightbox when navigating to a new entry
  useEffect(() => {
    setLightboxIndex(null);
  }, [entryState]);

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
    <div
      className={styles.wrapper}
      onTouchStart={pageSwipe.onTouchStart}
      onTouchEnd={pageSwipe.onTouchEnd}
    >
      {/* Top bar: the host's identity block (if any) opposite the nav strip */}
      <div className={`${styles.column} ${styles.topBar}`}>
        <div className={styles.topLeft}>
          {onClose && (
            <button className={styles.navBtn} onClick={onClose} aria-label="Back to grid">
              <ArrowLeft size={16} strokeWidth={1.6} />
              <span style={{ fontSize: '12px' }}>Back</span>
            </button>
          )}
          {header}
          {entryActions}
        </div>
        <EntryNavStrip
          date={entry.date}
          prevEntryId={prevEntryId}
          nextEntryId={nextEntryId}
          onNavigate={onNavigate}
          entries={entries}
          loadCalendarMonth={loadCalendarMonth}
          loadHistory={loadHistory}
          resolveAsset={resolveAsset}
          baseUrl={baseUrl}
        />
      </div>

      {/* Photo */}
      <div className={styles.photoOuter}>
        <div className={styles.column}>
          <div className={styles.photoFrame}>
            {imagePath && !imageSrc && (
              <div className={styles.photoPlaceholder}>
                <Loader2 size={28} strokeWidth={1.6} className={styles.spinner} />
              </div>
            )}
            {imageSrc && (
              <div className={styles.photoInner}>
                <img
                  src={imageSrc}
                  alt={entry.title}
                  className={`${styles.photo} ${photoFit === 'capped' ? styles.photoCapped : ''}`}
                  onError={() => {
                    // The browser couldn't draw it (e.g. a corrupt cached copy): drop that copy
                    // and try once more from scratch, rather than leaving a broken photo up.
                    if (!resolveAsset || !imagePath || photoAttempt > 0) return;
                    void Promise.resolve(invalidateAsset?.(imagePath)).then(() =>
                      setPhotoAttempt(1),
                    );
                  }}
                />
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
      </div>

      {/* Below-image content. Three grid areas — main (title + description), side (stats, tags,
          EXIF, actions) and comments — so the order is Blipfoto's when narrow (main, side,
          comments) and two columns when wide (main + comments left, side right). */}
      <div className={styles.metaScroll}>
        <div className={styles.metaInner}>
          <div className={styles.metaGrid}>
            <div className={styles.metaMain}>
              {entry.title && <h2 className={styles.entryTitle}>{entry.title}</h2>}
              {entry.description && (
                <BBCodeText
                  source={entry.description}
                  className={styles.description}
                  onLinkClick={onLinkClick}
                />
              )}
            </div>

            <div className={styles.metaSide}>
              {/* Views + the stars / hearts / fullscreen pill */}
              <div className={styles.statsRow}>
                {entry.views_total > 0 && (
                  <div className={styles.viewsBlock}>
                    <span className={styles.viewCount}>{entry.views_total.toLocaleString()}</span>
                    <span className={styles.viewLabel}>views</span>
                  </div>
                )}
                <div className={styles.pill}>
                  {reactions ? (
                    <button
                      className={`${styles.pillSeg} ${styles.pillBtn}`}
                      onClick={reactions.onToggleStar}
                      aria-pressed={reactions.starred}
                      aria-label={reactions.starred ? 'Remove star' : 'Star this entry'}
                    >
                      <Star size={14} strokeWidth={1.5} fill="currentColor" />
                      {entry.stars_total}
                    </button>
                  ) : (
                    <span className={styles.pillSeg}>
                      <Star size={14} strokeWidth={1.5} fill="currentColor" />
                      {entry.stars_total}
                    </span>
                  )}
                  {reactions ? (
                    <button
                      className={`${styles.pillSeg} ${styles.pillBtn}`}
                      onClick={reactions.onToggleFavorite}
                      aria-pressed={reactions.favorited}
                      aria-label={reactions.favorited ? 'Remove favourite' : 'Favourite this entry'}
                    >
                      <Heart size={14} strokeWidth={1.5} fill="currentColor" />
                      {entry.favorites_total}
                    </button>
                  ) : (
                    <span className={styles.pillSeg}>
                      <Heart size={14} strokeWidth={1.5} fill="currentColor" />
                      {entry.favorites_total}
                    </span>
                  )}
                  {imagePath && (
                    <button
                      className={`${styles.pillSeg} ${styles.pillBtn}`}
                      onClick={() => (onFullscreen ? onFullscreen() : setLightboxIndex(0))}
                      aria-label="View photo full-screen"
                    >
                      <Maximize2 size={14} strokeWidth={1.5} />
                    </button>
                  )}
                </div>
              </div>

              {entry.tags.length > 0 && (
                <div className={styles.tags}>
                  {entry.tags.map((tag) =>
                    onTagClick ? (
                      <button
                        key={tag}
                        className={styles.tag}
                        onClick={() => onTagClick(tag)}
                        aria-label={`Entries tagged ${tag}`}
                        style={{ font: 'inherit', cursor: 'pointer' }}
                      >
                        {tag}
                      </button>
                    ) : (
                      <span key={tag} className={styles.tag}>
                        {tag}
                      </span>
                    ),
                  )}
                </div>
              )}

              {/* Extras thumbnail row */}
              {extras.length > 0 && (
                <div className={styles.extrasRow}>
                  {extras.slice(0, 2).map((extra, i) => {
                    const thumbPath = extra.thumbnail ?? extra.image ?? null;
                    if (!thumbPath) return null;
                    const thumbSrc = resolveAsset
                      ? undefined
                      : baseUrl
                        ? `${baseUrl}/${thumbPath}`
                        : thumbPath;
                    // lightbox index: 0 = main, 1+ = extras
                    const lightboxIdx = i + 1;
                    const isLast = i === 1 && extras.length > 2;
                    const overflow = extras.length - 2;
                    return (
                      <button
                        key={extra.item_id}
                        className={styles.extraThumb}
                        onClick={() => setLightboxIndex(lightboxIdx)}
                        aria-label={`View extra image ${i + 1}`}
                      >
                        <AsyncThumb
                          path={thumbPath}
                          syncSrc={thumbSrc}
                          resolveAsset={resolveAsset}
                          className={styles.extraThumbImg}
                        />
                        {isLast && overflow > 0 && (
                          <div className={styles.extraOverflow}>+{overflow}</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* EXIF */}
              {entry.exif && <ExifRows exif={entry.exif} />}

              {/* Right-aligned pills: where it was taken, and the owner's edit / delete */}
              {(entry.location || ownerActions?.onEdit || ownerActions?.onDelete) && (
                <div className={styles.actionsRow}>
                  {entry.location &&
                    (onLocationClick ? (
                      <div className={styles.pill}>
                        <button
                          className={`${styles.pillSeg} ${styles.pillBtn}`}
                          onClick={() => onLocationClick(entry.location!)}
                          aria-label="View on map"
                        >
                          <MapPin size={14} strokeWidth={1.5} />
                        </button>
                      </div>
                    ) : (
                      <div className={styles.pill}>
                        <a
                          className={`${styles.pillSeg} ${styles.pillBtn}`}
                          href={`https://maps.google.com/maps?q=${entry.location.lat},${entry.location.lon}`}
                          target="_blank"
                          rel="noreferrer"
                          aria-label="View on map"
                        >
                          <MapPin size={14} strokeWidth={1.5} />
                        </a>
                      </div>
                    ))}
                  {(ownerActions?.onEdit || ownerActions?.onDelete) && (
                    <div className={styles.pill}>
                      {ownerActions.onEdit && (
                        <button
                          className={`${styles.pillSeg} ${styles.pillBtn}`}
                          onClick={ownerActions.onEdit}
                          aria-label="Edit entry"
                        >
                          <Pencil size={14} strokeWidth={1.5} />
                        </button>
                      )}
                      {ownerActions.onDelete && (
                        <button
                          className={`${styles.pillSeg} ${styles.pillBtn}`}
                          onClick={ownerActions.onDelete}
                          aria-label="Delete entry"
                        >
                          <Trash2 size={14} strokeWidth={1.5} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {(entry.comments.length > 0 || commentComposer) && (
              <div className={`${styles.metaComments} ${styles.commentsSection}`}>
                <h3 className={styles.commentsHeader}>Comments ({entry.comments.length})</h3>
                {/* The composer sits above the list, as on blipfoto.com. */}
                {commentComposer}
                {entry.comments.map((c) => (
                  <CommentThread
                    key={c.comment_id}
                    comment={c}
                    renderCommentActions={renderCommentActions}
                    renderCommentEditor={renderCommentEditor}
                    renderCommentReply={renderCommentReply}
                    renderCommenterBadges={renderCommenterBadges}
                    onUserClick={onUserClick}
                    onLinkClick={onLinkClick}
                    resolveAsset={resolveAsset}
                    baseUrl={baseUrl}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {lightboxIndex !== null && lightboxUrls.length > 0 && (
        <Lightbox
          images={lightboxUrls}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}
    </div>
  );
}
