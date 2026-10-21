// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useEffect, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useSwipeNav } from '../useSwipeNav.js';
import { fitContain } from '../lightboxFit.js';
import type { Size } from '../lightboxFit.js';
import styles from './Lightbox.module.css';

interface LightboxProps {
  images: string[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
  /** Fired if the current image's own <img> fails to load — this component has no retry UI of
   * its own (a broken image just renders as the browser's own broken-image glyph), so a host that
   * needs one (e.g. a placeholder-with-retry state) supplies this and reacts however it likes. */
  onImageError?: () => void;
  /** Top-bar text: title, then journal name and date beneath it. Any may be omitted. */
  title?: string;
  journalTitle?: string;
  date?: string;
  /** Host-driven previous/next (e.g. the adjacent *entries*, when `images` is one photo). When this
   * prop is present the arrows and arrow keys/swipes use it instead of stepping `index`; a missing
   * handler disables that arrow. */
  entryNav?: { onPrevious?: () => void; onNext?: () => void };
}

export function Lightbox({
  images,
  index,
  onClose,
  onNavigate,
  onImageError,
  title,
  journalTitle,
  date,
  entryNav,
}: LightboxProps) {
  const goPrev = useMemo(
    () => (entryNav ? entryNav.onPrevious : index > 0 ? () => onNavigate(index - 1) : undefined),
    [entryNav, index, onNavigate],
  );
  const goNext = useMemo(
    () =>
      entryNav
        ? entryNav.onNext
        : index < images.length - 1
          ? () => onNavigate(index + 1)
          : undefined,
    [entryNav, index, images.length, onNavigate],
  );
  const showArrows = entryNav !== undefined || images.length > 1;

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev?.();
      if (e.key === 'ArrowRight') goNext?.();
    },
    [onClose, goPrev, goNext],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  const swipe = useSwipeNav({
    onSwipeLeft: () => goNext?.(),
    onSwipeRight: () => goPrev?.(),
  });

  // Fit-to-screen: the image is sized explicitly (contain within the stage) rather than by CSS
  // percentages inside a shrink-to-fit wrapper — that combination collapsed a portrait image into
  // a narrow band and then zoomed only inside it. With the content exactly the fitted size, the
  // zoom library's pan bounds are the image's own edges.
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Size>({ width: 0, height: 0 });
  const [natural, setNatural] = useState<Size | null>(null);

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ width: el.clientWidth, height: el.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const currentSrc = images[index];
  useEffect(() => {
    setNatural(null);
  }, [currentSrc]);

  const fitted = natural ? fitContain(natural, stage) : { width: 0, height: 0 };
  const hasHeader = Boolean(title || journalTitle || date);

  return (
    <div
      className={styles.backdrop}
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.topBar}>
        <div className={styles.headerText}>
          {hasHeader && (
            <>
              {title && <div className={styles.headerTitle}>{title}</div>}
              {(journalTitle || date) && (
                <div className={styles.headerSub}>
                  {journalTitle}
                  {journalTitle && date ? ' · ' : ''}
                  {date}
                </div>
              )}
            </>
          )}
        </div>
        {showArrows && (
          <>
            <button
              className={styles.barBtn}
              onClick={goPrev}
              disabled={!goPrev}
              aria-label="Previous image"
            >
              <ChevronLeft size={24} strokeWidth={1.8} />
            </button>
            <button
              className={styles.barBtn}
              onClick={goNext}
              disabled={!goNext}
              aria-label="Next image"
            >
              <ChevronRight size={24} strokeWidth={1.8} />
            </button>
          </>
        )}
        <button className={styles.barBtn} onClick={onClose} aria-label="Close">
          <X size={22} strokeWidth={1.8} />
        </button>
      </div>

      <div className={styles.stage} ref={stageRef}>
        {/* Keyed by image and stage size so a rotation/resize or a new photo re-centres at fit. */}
        <TransformWrapper
          key={`${images[index]}|${Math.round(stage.width)}x${Math.round(stage.height)}`}
          doubleClick={{ mode: 'toggle' }}
          centerOnInit
          minScale={1}
          maxScale={8}
        >
          <TransformComponent
            wrapperStyle={{ width: '100%', height: '100%' }}
            contentStyle={{
              width: fitted.width,
              height: fitted.height,
              // Stop the browser claiming a double-tap/pinch for page zoom; the library handles them.
              touchAction: 'none',
            }}
          >
            <img
              src={images[index]}
              alt=""
              className={styles.image}
              style={{
                width: fitted.width,
                height: fitted.height,
                visibility: natural ? 'visible' : 'hidden',
              }}
              draggable={false}
              onLoad={(e) =>
                setNatural({
                  width: e.currentTarget.naturalWidth,
                  height: e.currentTarget.naturalHeight,
                })
              }
              onError={onImageError}
            />
          </TransformComponent>
        </TransformWrapper>
      </div>
      {images.length > 1 && (
        <div className={styles.counter}>
          {index + 1} / {images.length}
        </div>
      )}
    </div>
  );
}
