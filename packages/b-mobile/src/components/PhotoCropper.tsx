// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// react-easy-crop wrapper shared by both crop operations (§15) — a coordinate picker with a live
// preview. This component itself doesn't know or care which of the two it's being used for: it
// just reports the current crop rect (both as a 0-100 percentage of the image, and in source-
// image pixels) on every change, via onCropAreaChange. The caller decides what to do with that:
//   - SCR-10 (this phase): data/imageCrop.ts's cropToProportions() turns the percentage rect into
//     thumbnail_crop's x,y,w — nothing is re-encoded, the untouched photo is what gets uploaded.
//   - SCR-25 (Phase 8, avatar): cropToJpegBlob() uses the pixel rect to draw+re-encode a JPEG.
// Always a square aspect here (both operations are square crops per app-architecture.md §15).

import { useState } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';

interface PhotoCropperProps {
  imageSrc: string;
  onCropAreaChange: (percent: Area, pixels: Area) => void;
}

export function PhotoCropper({ imageSrc, onCropAreaChange }: PhotoCropperProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  return (
    <div style={{ position: 'relative', width: '100%', height: 320, background: '#000' }}>
      <Cropper
        image={imageSrc}
        crop={crop}
        zoom={zoom}
        aspect={1}
        cropShape="rect"
        showGrid
        onCropChange={setCrop}
        onZoomChange={setZoom}
        onCropComplete={(percent, pixels) => onCropAreaChange(percent, pixels)}
      />
    </div>
  );
}
