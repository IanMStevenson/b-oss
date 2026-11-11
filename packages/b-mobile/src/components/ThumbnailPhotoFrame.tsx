// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The photo on the compose and edit screens, shown as the entry's *thumbnail* (the selected square,
// or the API's default square when none is chosen), with a member-only "Choose thumbnail" button
// that swaps it for the full photo and the square cropper. Shared by SCR-10 (new entry) and
// SCR-13 (replacing a photo). The crop it reports becomes the entry's `thumbnail_crop`.

import { useRef, useState } from 'react';
import type { Area } from 'react-easy-crop';
import { PhotoCropper } from './PhotoCropper.js';
import { SquareSelector } from './SquareSelector.js';
import {
  canSelectThumbnail,
  defaultThumbnailCrop,
  thumbnailCropToArea,
  THUMBNAIL_MIN_EDGE,
} from '../data/imageCrop.js';
import type { ComposePhoto, ThumbnailCropDraft } from '../state/composeDraftStore.js';
import { isFinePointer } from '../theme/finePointer.js';
import './ComposeForm.css';

const PREVIEW_SIZE = 200;

interface ThumbnailPhotoFrameProps {
  photo: ComposePhoto;
  /** The selected thumbnail, or null for the default. */
  crop: ThumbnailCropDraft | null;
  /** Thumbnail selection is offered to members only. */
  canSelect: boolean;
  onCropChange: (percent: Area) => void;
}

export function ThumbnailPhotoFrame({
  photo,
  crop,
  canSelect,
  onCropChange,
}: ThumbnailPhotoFrameProps) {
  const [cropping, setCropping] = useState(false);
  // Displayed width / height, measured from the loaded image: the picker's own dimensions ignore
  // the EXIF rotation the WebView applies, so they can't be used for the crop geometry.
  const [ratio, setRatio] = useState<number | null>(null);
  const [naturalWidth, setNaturalWidth] = useState<number | null>(null);
  // The square being dragged while cropping. Only "Use thumbnail" reports it to the parent, so
  // "Cancel" leaves the previous selection untouched.
  const pending = useRef<Area | null>(null);

  function startCropping(): void {
    pending.current = null;
    setCropping(true);
  }

  function useThumbnail(): void {
    if (pending.current) onCropChange(pending.current);
    setCropping(false);
  }

  const shown = ratio ? (crop ?? defaultThumbnailCrop(ratio)) : null;
  const canOffer = canSelect && canSelectThumbnail(photo.width, photo.height);

  return (
    <div className="compose-thumb-frame">
      {cropping ? (
        <div className="compose-photo-frame">
          {isFinePointer() && shown && ratio && naturalWidth ? (
            <SquareSelector
              imageSrc={photo.webPath}
              initial={shown}
              ratio={ratio}
              naturalWidth={naturalWidth}
              minCropEdge={THUMBNAIL_MIN_EDGE}
              onCropAreaChange={(a) => (pending.current = a)}
            />
          ) : (
            <PhotoCropper
              imageSrc={photo.webPath}
              onCropAreaChange={(a) => (pending.current = a)}
              minCropEdge={THUMBNAIL_MIN_EDGE}
              initialArea={shown && ratio ? thumbnailCropToArea(shown, ratio) : undefined}
            />
          )}
        </div>
      ) : (
        <div
          className={`compose-thumb-preview${canOffer ? ' compose-thumb-preview-editable' : ''}`}
          style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
          {...(canOffer
            ? {
                role: 'button',
                tabIndex: 0,
                'aria-label': 'Choose thumbnail',
                onClick: startCropping,
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    startCropping();
                  }
                },
              }
            : {})}
        >
          <img
            src={photo.webPath}
            alt="Thumbnail"
            onLoad={(e) => {
              setRatio(e.currentTarget.naturalWidth / (e.currentTarget.naturalHeight || 1));
              setNaturalWidth(e.currentTarget.naturalWidth);
            }}
            style={
              shown && ratio
                ? {
                    width: `${100 / shown.w}%`,
                    left: `${-(shown.x / shown.w) * 100}%`,
                    top: `${-(shown.y / (shown.w * ratio)) * 100}%`,
                  }
                : { visibility: 'hidden' }
            }
          />
          {canOffer && (
            <span className="compose-thumb-overlay">
              Choose thumbnail
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M1 2h14v12H1zM2.5 3.5v9h11v-9zM4 11l2.5-3 2 2 1.5-1.5L12 11zM5.5 6a1 1 0 1 0 0 .01z"
                />
              </svg>
            </span>
          )}
        </div>
      )}
      {cropping && (
        <div className="compose-thumb-actions">
          <button type="button" className="compose-thumb-btn" onClick={() => setCropping(false)}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                d="M3 3l10 10M13 3L3 13"
              />
            </svg>
            Cancel
          </button>
          <button type="button" className="compose-thumb-btn" onClick={useThumbnail}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.5 8.5l4 4 7-8.5"
              />
            </svg>
            Use thumbnail
          </button>
        </div>
      )}
    </div>
  );
}
