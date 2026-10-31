// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// IonModal needs Ionic's overlay machinery; the view inside is what is under test.
vi.mock('@ionic/react', async (importOriginal) => {
  const real = await importOriginal<typeof import('@ionic/react')>();
  return {
    ...real,
    IonModal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
      isOpen ? <div>{children}</div> : null,
  };
});

const { openWebcam, grabFrame } = vi.hoisted(() => ({ openWebcam: vi.fn(), grabFrame: vi.fn() }));
vi.mock('../../platform/webcam.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/webcam.js')>()),
  openWebcam,
  grabFrame,
}));

import { WebcamCapture } from '../WebcamCapture.js';

function fakeStream() {
  const stop = vi.fn();
  return { stream: { getTracks: () => [{ stop }] } as unknown as MediaStream, stop };
}

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('WebcamCapture', () => {
  it('previews, captures, offers retake, and hands back a picker-shaped photo on Use', async () => {
    const { stream, stop } = fakeStream();
    openWebcam.mockResolvedValue(stream);
    grabFrame.mockResolvedValue(new Blob(['x'], { type: 'image/jpeg' }));
    URL.createObjectURL = vi.fn(() => 'blob:shot');
    const revoke = vi.fn();
    URL.revokeObjectURL = revoke;
    const onUse = vi.fn();
    const view = render(<WebcamCapture open onCancel={vi.fn()} onUse={onUse} />);
    // jsdom has no media playback; give the element a size so the capture path has a frame.
    const video = screen.getByTestId<HTMLVideoElement>('webcam-video');
    Object.defineProperty(video, 'videoWidth', { value: 640 });
    Object.defineProperty(video, 'videoHeight', { value: 480 });
    Object.defineProperty(video, 'play', { value: () => Promise.resolve() });
    await userEvent.click(await screen.findByText('Take photo'));
    await userEvent.click(await screen.findByText('Retake'));
    await userEvent.click(await screen.findByText('Take photo'));
    await userEvent.click(await screen.findByText('Use photo'));
    expect(onUse).toHaveBeenCalledWith(
      expect.objectContaining({
        webPath: 'blob:shot',
        mimeType: 'image/jpeg',
        width: 640,
        height: 480,
      }),
    );
    expect(stop).toHaveBeenCalled();
    // Closing the view after Use (the screen does) must not revoke the kept photo either.
    view.unmount();
    // The kept photo's URL belongs to the draft now, so it is not revoked on Use.
    expect(revoke).toHaveBeenCalledTimes(1); // only the retaken shot
  });

  it('stops the camera when cancelled', async () => {
    const { stream, stop } = fakeStream();
    openWebcam.mockResolvedValue(stream);
    const onCancel = vi.fn();
    const view = render(<WebcamCapture open onCancel={onCancel} onUse={vi.fn()} />);
    await waitFor(() => expect(openWebcam).toHaveBeenCalled());
    await userEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
    view.rerender(<WebcamCapture open={false} onCancel={onCancel} onUse={vi.fn()} />);
    await waitFor(() => expect(stop).toHaveBeenCalled());
  });

  it('explains a blocked camera in the view, with Cancel still available', async () => {
    openWebcam.mockRejectedValue(new DOMException('', 'NotAllowedError'));
    render(<WebcamCapture open onCancel={vi.fn()} onUse={vi.fn()} />);
    expect(await screen.findByText(/Camera access is blocked/)).toBeDefined();
    expect(screen.getByText('Cancel')).toBeDefined();
    expect(screen.queryByText('Take photo')).toBeNull();
  });
});
