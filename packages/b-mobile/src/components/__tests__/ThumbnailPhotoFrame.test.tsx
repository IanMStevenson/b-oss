// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Area } from 'react-easy-crop';

// The cropper is replaced by a button that "drags" to a known square.
const DRAGGED: Area = { x: 10, y: 20, width: 30, height: 30 };
vi.mock('../PhotoCropper.js', () => ({
  PhotoCropper: ({ onCropAreaChange }: { onCropAreaChange: (a: Area) => void }) => (
    <button onClick={() => onCropAreaChange(DRAGGED)}>drag</button>
  ),
}));

import { ThumbnailPhotoFrame } from '../ThumbnailPhotoFrame.js';

afterEach(cleanup);

const photo = {
  webPath: 'x.jpg',
  mimeType: 'image/jpeg',
  width: 1200,
  height: 800,
  createdAt: null,
  sizeBytes: 400000,
};

function setup(canSelect = true) {
  const onCropChange = vi.fn();
  render(
    <ThumbnailPhotoFrame
      photo={photo}
      crop={null}
      canSelect={canSelect}
      onCropChange={onCropChange}
    />,
  );
  return onCropChange;
}

describe('ThumbnailPhotoFrame', () => {
  it('tapping the thumbnail enters edit mode; Cancel discards the drag', () => {
    const onCropChange = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Choose thumbnail' }));
    fireEvent.click(screen.getByText('drag'));
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCropChange).not.toHaveBeenCalled();
    expect(screen.queryByText('Use thumbnail')).toBeNull();
  });

  it('Use thumbnail reports the dragged square and leaves edit mode', () => {
    const onCropChange = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Choose thumbnail' }));
    fireEvent.click(screen.getByText('drag'));
    fireEvent.click(screen.getByText('Use thumbnail'));
    expect(onCropChange).toHaveBeenCalledWith(DRAGGED);
    expect(screen.queryByText('Cancel')).toBeNull();
  });

  it('is not tappable for non-members', () => {
    setup(false);
    expect(screen.queryByRole('button', { name: 'Choose thumbnail' })).toBeNull();
  });
});
