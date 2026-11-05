// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  classifyWebcamError,
  hasWebcam,
  openWebcam,
  stopStream,
  toPickedPhoto,
  webcamReducer,
  type WebcamState,
} from '../webcam.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function fakeStream(): { stream: MediaStream; stop: ReturnType<typeof vi.fn> } {
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }, { stop }] } as unknown as MediaStream;
  return { stream, stop };
}

describe('webcamReducer', () => {
  const starting: WebcamState = { kind: 'starting' };

  it('goes starting > live > review > live (retake)', () => {
    const live = webcamReducer(starting, { type: 'started' });
    expect(live).toEqual({ kind: 'live' });
    const review = webcamReducer(live, { type: 'captured', photoUrl: 'blob:x' });
    expect(review).toEqual({ kind: 'review', photoUrl: 'blob:x' });
    expect(webcamReducer(review, { type: 'retake' })).toEqual({ kind: 'live' });
  });

  it('a failure at any point is a message state, not an exception', () => {
    expect(webcamReducer(starting, { type: 'failed', reason: 'blocked' })).toEqual({
      kind: 'failed',
      reason: 'blocked',
    });
  });

  it('ignores events that do not apply (a late start after failure, capture before live)', () => {
    const failed: WebcamState = { kind: 'failed', reason: 'no-camera' };
    expect(webcamReducer(failed, { type: 'started' })).toBe(failed);
    expect(webcamReducer(starting, { type: 'captured', photoUrl: 'blob:x' })).toBe(starting);
    expect(webcamReducer(starting, { type: 'retake' })).toBe(starting);
  });
});

describe('classifyWebcamError', () => {
  it.each([
    ['NotAllowedError', 'blocked'],
    ['SecurityError', 'blocked'],
    ['NotFoundError', 'no-camera'],
    ['NotReadableError', 'in-use'],
    ['Whatever', 'unavailable'],
  ])('%s -> %s', (name, reason) => {
    expect(classifyWebcamError(new DOMException('', name))).toBe(reason);
  });
  it('treats a non-error as unavailable', () => {
    expect(classifyWebcamError('boom')).toBe('unavailable');
  });
});

describe('hasWebcam', () => {
  it('is true when a video input exists, false for none, for a rejection, and without the API', async () => {
    const devices = (list: { kind: string }[]) =>
      vi.stubGlobal('navigator', {
        mediaDevices: { enumerateDevices: () => Promise.resolve(list) },
      });
    devices([{ kind: 'audioinput' }, { kind: 'videoinput' }]);
    expect(await hasWebcam()).toBe(true);
    devices([{ kind: 'audioinput' }]);
    expect(await hasWebcam()).toBe(false);
    vi.stubGlobal('navigator', {
      mediaDevices: { enumerateDevices: () => Promise.reject(new Error('x')) },
    });
    expect(await hasWebcam()).toBe(false);
    vi.stubGlobal('navigator', {});
    expect(await hasWebcam()).toBe(false);
  });
});

describe('openWebcam / stopStream', () => {
  it('asks for video only, and stopStream stops every track', async () => {
    const { stream, stop } = fakeStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    expect(await openWebcam()).toBe(stream);
    expect(getUserMedia.mock.calls[0]?.[0]).toMatchObject({ audio: false });
    stopStream(stream);
    expect(stop).toHaveBeenCalledTimes(2);
    expect(() => stopStream(null)).not.toThrow();
  });

  it('rejects with NotFoundError when the API is missing', async () => {
    vi.stubGlobal('navigator', {});
    await expect(openWebcam()).rejects.toMatchObject({ name: 'NotFoundError' });
  });
});

describe('toPickedPhoto', () => {
  it('has the same shape the file picker returns', () => {
    const photo = toPickedPhoto(
      new Blob(['abc']),
      'blob:y',
      { width: 640, height: 480 },
      new Date('2026-10-31T10:00:00Z'),
    );
    expect(photo).toEqual({
      webPath: 'blob:y',
      mimeType: 'image/jpeg',
      width: 640,
      height: 480,
      createdAt: '2026-10-31T10:00:00.000Z',
      sizeBytes: 3,
    });
  });
});
