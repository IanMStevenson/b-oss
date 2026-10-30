// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The photo on the compose and edit screens, shown as the entry's *thumbnail* (the selected square,
// or the API's default square when none is chosen), with a member-only "Select thumbnail" button
// that swaps it for the full photo and the square cropper. Shared by SCR-10 (new entry) and
// SCR-13 (replacing a photo). The crop it reports becomes the entry's `thumbnail_crop`.

import { useState } from 'react';
import { IonButton } from '@ionic/react';
import type { Area } from 'react-easy-crop';
import { PhotoCropper } from './PhotoCropper.js';
import {
  canSelectThumbnail,
  defaultThumbnailCrop,
  thumbnailCropToArea,
  THUMBNAIL_MIN_EDGE,
} from '../data/imageCrop.js';
import type { ComposePhoto, ThumbnailCropDraft } from '../state/composeDraftStore.js';
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

  const shown = ratio ? (crop ?? defaultThumbnailCrop(ratio)) : null;
  const canOffer = canSelect && canSelectThumbnail(photo.width, photo.height);

  return (
    <div className="compose-thumb-frame">
      {cropping ? (
        <div className="compose-photo-frame">
          <PhotoCropper
            imageSrc={photo.webPath}
            onCropAreaChange={onCropChange}
            minCropEdge={THUMBNAIL_MIN_EDGE}
            initialArea={shown && ratio ? thumbnailCropToArea(shown, ratio) : undefined}
          />
        </div>
      ) : (
        <div
          className="compose-thumb-preview"
          style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
        >
          <img
            src={photo.webPath}
            alt="Thumbnail"
            onLoad={(e) =>
              setRatio(e.currentTarget.naturalWidth / (e.currentTarget.naturalHeight || 1))
            }
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
        </div>
      )}
      {canOffer && (
        <IonButton
          size="small"
          fill={cropping ? 'solid' : 'outline'}
          onClick={() => setCropping((c) => !c)}
        >
          {cropping ? 'Done' : 'Select thumbnail'}
        </IonButton>
      )}
    </div>
  );
}
