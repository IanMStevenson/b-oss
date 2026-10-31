// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Pointer-fine thumbnail picker (b-oss#718): the whole photo, dimmed, with a square selection that
// can be dragged to move and resized from its corners (aspect locked). Arrow keys nudge it.
// Reports the same percent area as PhotoCropper, so the draft's thumbnail_crop is unchanged.

import { useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, KeyboardEvent } from 'react';
import type { Area } from 'react-easy-crop';
import type { ThumbnailCrop } from '../data/imageCrop.js';
import {
  clampSelection,
  moveSelection,
  resizeSelection,
  selectionToArea,
  widthLimits,
} from '../data/squareSelection.js';
import type { Corner } from '../data/squareSelection.js';
import './SquareSelector.css';

interface SquareSelectorProps {
  imageSrc: string;
  /** Where the selection starts. */
  initial: ThumbnailCrop;
  /** Displayed width / height. */
  ratio: number;
  /** Source image width in pixels, to enforce the minimum edge. */
  naturalWidth: number;
  minCropEdge: number;
  onCropAreaChange: (percent: Area) => void;
}

const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];
const NUDGE = 0.01;

export function SquareSelector({
  imageSrc,
  initial,
  ratio,
  naturalWidth,
  minCropEdge,
  onCropAreaChange,
}: SquareSelectorProps) {
  const limits = widthLimits(ratio, naturalWidth, minCropEdge);
  const [sel, setSel] = useState(() => clampSelection(initial, ratio, limits));
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<
    { kind: 'move'; px: number; py: number; start: ThumbnailCrop } | { kind: Corner } | null
  >(null);

  const commit = (next: ThumbnailCrop): void => {
    setSel(next);
    onCropAreaChange(selectionToArea(next, ratio));
  };

  const fraction = (e: ReactPointerEvent): { fx: number; fy: number } => {
    const r = stage.current!.getBoundingClientRect();
    return { fx: (e.clientX - r.left) / r.width, fy: (e.clientY - r.top) / r.height };
  };

  const start = (e: ReactPointerEvent, kind: 'move' | Corner): void => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (kind === 'move') {
      const { fx, fy } = fraction(e);
      drag.current = { kind, px: fx, py: fy, start: sel };
    } else {
      drag.current = { kind };
    }
  };

  const onMove = (e: ReactPointerEvent): void => {
    const d = drag.current;
    if (!d) return;
    const { fx, fy } = fraction(e);
    if (d.kind === 'move') {
      commit(moveSelection(d.start, fx - d.px, fy - d.py, ratio, limits));
    } else {
      commit(resizeSelection(sel, d.kind, fx, fy, ratio, limits));
    }
  };

  const end = (): void => {
    drag.current = null;
  };

  const onKey = (e: KeyboardEvent): void => {
    const step = e.shiftKey ? NUDGE * 5 : NUDGE;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    commit(moveSelection(sel, d[0], d[1], ratio, limits));
  };

  return (
    <div className="square-selector" style={{ aspectRatio: String(ratio) }} ref={stage}>
      <img src={imageSrc} alt="" draggable={false} />
      <div
        className="square-selector-box"
        role="group"
        aria-label="Thumbnail selection. Use the arrow keys to move it."
        tabIndex={0}
        data-testid="square-selection"
        style={{
          left: `${sel.x * 100}%`,
          top: `${sel.y * 100}%`,
          width: `${sel.w * 100}%`,
          height: `${sel.w * ratio * 100}%`,
        }}
        onPointerDown={(e) => start(e, 'move')}
        onPointerMove={onMove}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={onKey}
      >
        {CORNERS.map((c) => (
          <span
            key={c}
            className={`square-selector-handle square-selector-handle-${c}`}
            data-testid={`handle-${c}`}
            onPointerDown={(e) => start(e, c)}
            onPointerMove={onMove}
            onPointerUp={end}
            onPointerCancel={end}
          />
        ))}
      </div>
    </div>
  );
}
