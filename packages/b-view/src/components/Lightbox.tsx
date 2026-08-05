// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useSwipeNav } from '../useSwipeNav.js';
import styles from './Lightbox.module.css';

interface LightboxProps {
  images: string[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function Lightbox({ images, index, onClose, onNavigate }: LightboxProps) {
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onNavigate(index - 1);
      if (e.key === 'ArrowRight' && hasNext) onNavigate(index + 1);
    },
    [onClose, onNavigate, index, hasPrev, hasNext],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  const swipe = useSwipeNav({
    onSwipeLeft: () => hasNext && onNavigate(index + 1),
    onSwipeRight: () => hasPrev && onNavigate(index - 1),
  });

  return (
    <div
      className={styles.backdrop}
      onClick={onClose}
      onTouchStart={swipe.onTouchStart}
      onTouchEnd={swipe.onTouchEnd}
      role="dialog"
      aria-modal="true"
    >
      <button className={styles.close} onClick={onClose} aria-label="Close">
        <X size={20} strokeWidth={1.8} />
      </button>

      {hasPrev && (
        <button
          className={`${styles.navBtn} ${styles.navPrev}`}
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(index - 1);
          }}
          aria-label="Previous image"
        >
          <ChevronLeft size={28} strokeWidth={1.6} />
        </button>
      )}

      <div className={styles.imageWrap} onClick={(e) => e.stopPropagation()}>
        {/* No explicit wrapperStyle: TransformComponent defaults to sizing itself to its content
            (max-content), matching .imageWrap's existing shrink-to-fit/viewport-capped sizing —
            an explicit 100%/100% would collapse to 0 since the flex-column parent has no fixed
            height (unlike a full-bleed single-photo screen, which does size the wrapper that way). */}
        <TransformWrapper doubleClick={{ mode: 'toggle' }}>
          <TransformComponent>
            <img src={images[index]} alt="" className={styles.image} />
          </TransformComponent>
        </TransformWrapper>
        {images.length > 1 && (
          <div className={styles.counter}>
            {index + 1} / {images.length}
          </div>
        )}
      </div>

      {hasNext && (
        <button
          className={`${styles.navBtn} ${styles.navNext}`}
          onClick={(e) => {
            e.stopPropagation();
            onNavigate(index + 1);
          }}
          aria-label="Next image"
        >
          <ChevronRight size={28} strokeWidth={1.6} />
        </button>
      )}
    </div>
  );
}
