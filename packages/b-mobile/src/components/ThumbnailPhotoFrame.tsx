// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The photo preview on the compose and edit screens, with the member-only "Select thumbnail"
// button that swaps it for the square cropper. Shared by SCR-10 (new entry) and SCR-13 (replacing
// a photo). The crop it reports becomes the entry's `thumbnail_crop`.

import { useState } from 'react';
import { IonButton } from '@ionic/react';
import type { Area } from 'react-easy-crop';
import { PhotoCropper } from './PhotoCropper.js';
import { canSelectThumbnail, THUMBNAIL_MIN_EDGE } from '../data/imageCrop.js';
import type { ComposePhoto } from '../state/composeDraftStore.js';
import './ComposeForm.css';

interface ThumbnailPhotoFrameProps {
  photo: ComposePhoto;
  /** Thumbnail selection is offered to members only. */
  canSelect: boolean;
  onCropChange: (percent: Area) => void;
}

export function ThumbnailPhotoFrame({ photo, canSelect, onCropChange }: ThumbnailPhotoFrameProps) {
  const [cropping, setCropping] = useState(false);

  return (
    <div className="compose-photo-frame">
      {cropping ? (
        <PhotoCropper
          imageSrc={photo.webPath}
          onCropAreaChange={onCropChange}
          minCropEdge={THUMBNAIL_MIN_EDGE}
        />
      ) : (
        <img src={photo.webPath} alt="Selected" />
      )}
      {canSelect && canSelectThumbnail(photo.width, photo.height) && (
        // Legible over any photo: opaque white pill while idle, solid green once cropping is
        // active (a thin green outline vanished into the image).
        <IonButton
          size="small"
          className="compose-crop-button"
          fill={cropping ? 'solid' : 'outline'}
          onClick={() => setCropping((c) => !c)}
          style={
            cropping
              ? undefined
              : {
                  '--background': 'rgba(255, 255, 255, 0.92)',
                  '--background-activated': '#ffffff',
                  '--border-color': 'transparent',
                }
          }
        >
          {cropping ? 'Done' : 'Select thumbnail'}
        </IonButton>
      )}
    </div>
  );
}
