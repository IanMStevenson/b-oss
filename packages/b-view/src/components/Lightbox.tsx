// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { useEffect, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import type { ReactZoomPanPinchRef } from 'react-zoom-pan-pinch';
import { isEditableTarget } from '../isEditableTarget.js';
import { useKeyWheelZoom, keyZoomStep } from '../useKeyWheelZoom.js';
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
  /** Ctrl +/-/0 zoom and reset the photo (the library already zooms on the wheel), cancelling the
   * browser's page zoom. For a host with a keyboard whose page zoom is disabled; off by default. */
  keyboardZoom?: boolean;
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
  keyboardZoom = false,
}: LightboxProps) {
  const goPrev = useMemo(
    () => (index > 0 ? () => onNavigate(index - 1) : undefined),
    [index, onNavigate],
  );
  const goNext = useMemo(
    () => (index < images.length - 1 ? () => onNavigate(index + 1) : undefined),
    [index, images.length, onNavigate],
  );
  const showArrows = images.length > 1;

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      // Backspace closes (Esc is left to the system). Not while typing or with a modifier, and
      // not if a host handler already took the key.
      if (e.key === 'Backspace' && !e.defaultPrevented && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (isEditableTarget(e.target)) return;
        e.preventDefault();
        onClose();
        return;
      }
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
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  useKeyWheelZoom({
    enabled: keyboardZoom,
    target: stageRef,
    wheel: false,
    onZoom: (command) => {
      const api = transformRef.current;
      if (!api) return;
      const scale = api.instance.state.scale;
      if (command === 'in') void api.zoomIn(keyZoomStep(scale));
      // At fit there is nothing to zoom out to: do nothing rather than re-run the library's
      // zoom-to-point, which re-aligns the content and makes the image jump (b-oss#956).
      else if (command === 'out') {
        if (scale > 1) void api.zoomOut(keyZoomStep(scale));
      } else void api.resetTransform();
    },
  });
  // Dragging pans only while zoomed in; at fit the image stays put (b-oss#956).
  const [zoomed, setZoomed] = useState(false);
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

  // Portalled to <body>: the backdrop is position:fixed, but a fixed element is positioned against
  // the nearest ancestor with layout containment or a transform, not the window. Hosts have such
  // ancestors (EntryDetail's own container-type wrapper, which also scrolls; Ionic's ion-page and
  // split-pane), which left the overlay inside a scrolled, offset box with its top bar off-screen
  // (b-oss#953). React events still bubble through the portal to the host tree.
  return createPortal(
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
          ref={transformRef}
          key={`${images[index]}|${Math.round(stage.width)}x${Math.round(stage.height)}`}
          doubleClick={{ mode: 'toggle' }}
          centerOnInit
          // Content smaller than the stage (always, at fit) stays centred however it is zoomed
          // out or wheeled, instead of snapping to the stage's corner.
          centerZoomedOut
          panning={{ disabled: !zoomed }}
          onTransform={(ref) => setZoomed(ref.state.scale > 1.001)}
          // A wheel notch (deltaY 100) multiplies the scale by about 1.65; the library's default
          // 0.015 is about 4.5 per notch, which jumps straight to a deep zoom.
          wheel={{ step: 0.005 }}
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
    </div>,
    document.body,
  );
}
