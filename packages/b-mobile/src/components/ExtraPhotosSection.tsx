// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-10's "Extra photos" block (b-oss#1037, members only). Extras go through Blipfoto's own
// website, so the first time the member adds one they are asked to sign in there (once, not at
// account setup), through the shared gate (useSiteSignInGate).

import { useEffect, useState } from 'react';
import { IonText } from '@ionic/react';
import { pickPhoto } from '../platform/camera.js';
import type { ComposePhoto } from '../state/composeDraftStore.js';
import { MAX_EXTRAS, readExtrasRemaining } from '../flows/extrasFlow.js';
import { useSiteSignInGate } from './useSiteSignInGate.js';
import './ExtraPhotosSection.css';

interface Props {
  accountId: string;
  username: string;
  photos: ComposePhoto[];
  onChange: (photos: ComposePhoto[]) => void;
}

export function ExtraPhotosSection({ accountId, username, photos, onChange }: Props) {
  const gate = useSiteSignInGate(username);
  // The member's remaining allowance for the year (100 a year), which only the website knows. Null
  // until it has been read, and it can only be read with a website session, so until then nothing
  // about "remaining" is shown (b-oss#1043).
  const [allowance, setAllowance] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readExtrasRemaining().then((n) => {
      if (!cancelled) setAllowance(n);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function pickAndAdd(): Promise<void> {
    // Signed in by now (the gate saw to it), so the allowance can be read if it wasn't yet.
    if (allowance === null) void readExtrasRemaining().then(setAllowance);
    const photo = await pickPhoto(accountId);
    if (photo) onChange([...photos, photo]);
  }

  const remaining = allowance === null ? null : Math.max(0, allowance - photos.length);
  const full = photos.length >= MAX_EXTRAS || remaining === 0;

  return (
    <div className="compose-form extra-photos">
      <div className="extra-photos-head">
        <h3>Extra photos</h3>
        {remaining !== null && (
          <span className="extra-photos-remaining">{remaining} remaining</span>
        )}
      </div>
      <ul className="extra-photos-list">
        <li>
          <button
            type="button"
            className="extra-photos-add"
            aria-label="Add an extra photo"
            disabled={gate.busy || full}
            onClick={() => void gate.start(pickAndAdd)}
          >
            +
          </button>
        </li>
        {photos.map((photo, index) => (
          <li key={`${photo.webPath}-${index}`}>
            <img src={photo.webPath} alt={`Extra photo ${index + 1}`} />
            <button
              type="button"
              className="extra-photos-remove"
              aria-label={`Remove extra photo ${index + 1}`}
              onClick={() => onChange(photos.filter((_, i) => i !== index))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {gate.notice && (
        <IonText color="danger">
          <p>{gate.notice}</p>
        </IonText>
      )}
      {gate.alerts}
    </div>
  );
}
