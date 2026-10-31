// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The desktop shell's "Take a photo" view (b-oss#670): live preview, Take photo, then Retake / Use
// photo. Hands back the same PickedPhoto the file picker returns. A refused or missing camera shows
// a message inside the view, never an error screen. State machine: platform/webcam.ts.

import { useEffect, useReducer, useRef } from 'react';
import { IonModal, IonButton, IonText, IonSpinner } from '@ionic/react';
import type { PickedPhoto } from '../platform/camera.js';
import {
  WEBCAM_FAILURE_TEXT,
  classifyWebcamError,
  grabFrame,
  openWebcam,
  stopStream,
  toPickedPhoto,
  webcamReducer,
} from '../platform/webcam.js';
import './WebcamCapture.css';

interface WebcamCaptureProps {
  open: boolean;
  onCancel: () => void;
  onUse: (photo: PickedPhoto) => void;
}

export function WebcamCapture({ open, onCancel, onUse }: WebcamCaptureProps) {
  return (
    <IonModal isOpen={open} onDidDismiss={onCancel} className="webcam-modal">
      {open && <WebcamCaptureBody onCancel={onCancel} onUse={onUse} />}
    </IonModal>
  );
}

function WebcamCaptureBody({
  onCancel,
  onUse,
}: {
  onCancel: () => void;
  onUse: (photo: PickedPhoto) => void;
}) {
  const [state, dispatch] = useReducer(webcamReducer, { kind: 'starting' });
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const shot = useRef<{ blob: Blob; width: number; height: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    openWebcam().then(
      (stream) => {
        if (cancelled) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          void Promise.resolve(video.play()).catch(() => undefined);
        }
        dispatch({ type: 'started' });
      },
      (err: unknown) => {
        if (!cancelled) dispatch({ type: 'failed', reason: classifyWebcamError(err) });
      },
    );
    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  // The preview <video> exists from the first render; re-attach after a retake in case the element
  // was left paused.
  useEffect(() => {
    const video = videoRef.current;
    if (state.kind === 'live' && video && streamRef.current) {
      if (video.srcObject !== streamRef.current) video.srcObject = streamRef.current;
      void Promise.resolve(video.play()).catch(() => undefined);
    }
  }, [state.kind]);

  // A shot that is retaken, or abandoned by Cancel, is released; the one that was used is not.
  const kept = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (state.kind === 'review' && state.photoUrl !== kept.current) {
        URL.revokeObjectURL(state.photoUrl);
      }
    },
    [state],
  );

  async function capture(): Promise<void> {
    const video = videoRef.current;
    if (!video) return;
    const blob = await grabFrame(video);
    if (!blob) return;
    shot.current = { blob, width: video.videoWidth, height: video.videoHeight };
    dispatch({ type: 'captured', photoUrl: URL.createObjectURL(blob) });
  }

  function use(): void {
    if (state.kind !== 'review' || !shot.current) return;
    const { blob, width, height } = shot.current;
    // The object URL now belongs to the draft; `kept` stops the effect above revoking it.
    const url = state.photoUrl;
    kept.current = url;
    shot.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    onUse(toPickedPhoto(blob, url, { width, height }));
  }

  return (
    <div className="webcam-body">
      <div className="webcam-stage">
        <video
          ref={videoRef}
          className="webcam-video"
          data-testid="webcam-video"
          muted
          playsInline
          hidden={state.kind !== 'live'}
        />
        {state.kind === 'review' && (
          <img className="webcam-video" src={state.photoUrl} alt="The photo you just took" />
        )}
        {state.kind === 'starting' && <IonSpinner name="dots" />}
        {state.kind === 'failed' && (
          <IonText color="medium">
            <p className="webcam-message">{WEBCAM_FAILURE_TEXT[state.reason]}</p>
          </IonText>
        )}
      </div>
      <div className="webcam-actions">
        {state.kind === 'live' && <IonButton onClick={() => void capture()}>Take photo</IonButton>}
        {state.kind === 'review' && (
          <>
            <IonButton fill="outline" onClick={() => dispatch({ type: 'retake' })}>
              Retake
            </IonButton>
            <IonButton onClick={use}>Use photo</IonButton>
          </>
        )}
        <IonButton fill="clear" onClick={onCancel}>
          Cancel
        </IonButton>
      </div>
    </div>
  );
}
