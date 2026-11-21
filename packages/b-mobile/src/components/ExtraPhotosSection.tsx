// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-10's "Extra photos" block (b-oss#1037, members only). Extras go through Blipfoto's own
// website, so the first time the member adds one they are asked to sign in there (once, not at
// account setup), after a gate: only a member who signs in with an email and password can, and a
// Facebook or Twitter member is pointed at "Forgotten your details?" to set one first.

import { useRef, useState } from 'react';
import { IonAlert, IonButton, IonText } from '@ionic/react';
import { pickPhoto } from '../platform/camera.js';
import { openUrl } from '../platform/browser.js';
import type { ComposePhoto } from '../state/composeDraftStore.js';
import {
  MAX_EXTRAS,
  SIGN_IN_URL,
  currentSiteUser,
  isSameMember,
  signInToSite,
} from '../flows/extrasFlow.js';
import './ExtraPhotosSection.css';

interface Props {
  accountId: string;
  username: string;
  photos: ComposePhoto[];
  onChange: (photos: ComposePhoto[]) => void;
}

type Gate = 'ask' | 'set-password' | null;

export function ExtraPhotosSection({ accountId, username, photos, onChange }: Props) {
  const [gate, setGate] = useState<Gate>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Confirmed this session, so a second extra does not re-check.
  const signedIn = useRef(false);

  async function pickAndAdd(): Promise<void> {
    const photo = await pickPhoto(accountId);
    if (photo) onChange([...photos, photo]);
  }

  async function handleAdd(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      if (!signedIn.current) {
        const who = await currentSiteUser();
        if (!isSameMember(who, username)) {
          setGate('ask');
          return;
        }
        signedIn.current = true;
      }
      await pickAndAdd();
    } catch {
      setNotice("Couldn't add that photo.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignIn(): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      if (!(await signInToSite())) return;
      const who = await currentSiteUser();
      if (!isSameMember(who, username)) {
        setNotice(
          who
            ? `You signed in as ${who}, not ${username}. Extra photos need the same member as this entry.`
            : "Couldn't confirm the Blipfoto sign-in. Please try again.",
        );
        return;
      }
      signedIn.current = true;
      await pickAndAdd();
    } catch {
      setNotice("Couldn't add that photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="compose-form extra-photos">
      <h3>Extra photos</h3>
      <IonText color="medium">
        <p>Added to your entry after it is published.</p>
      </IonText>
      {photos.length > 0 && (
        <ul className="extra-photos-list">
          {photos.map((photo, index) => (
            <li key={`${photo.webPath}-${index}`}>
              <img src={photo.webPath} alt={`Extra photo ${index + 1}`} />
              <button
                type="button"
                aria-label={`Remove extra photo ${index + 1}`}
                onClick={() => onChange(photos.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {notice && (
        <IonText color="danger">
          <p>{notice}</p>
        </IonText>
      )}
      <IonButton
        expand="block"
        fill="outline"
        disabled={busy || photos.length >= MAX_EXTRAS}
        onClick={() => void handleAdd()}
      >
        Add an extra photo
      </IonButton>

      <IonAlert
        isOpen={gate === 'ask'}
        header="Sign in to Blipfoto"
        message="Extra photos use your Blipfoto website sign-in. Do you sign in to Blipfoto with an email address and password?"
        onDidDismiss={() => setGate((g) => (g === 'ask' ? null : g))}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          { text: 'No', handler: () => setGate('set-password') },
          { text: 'Yes, sign in', handler: () => void handleSignIn() },
        ]}
      />
      <IonAlert
        isOpen={gate === 'set-password'}
        header="Set a password first"
        message="If you sign in with Facebook or Twitter, you can set a password using “Forgotten your details?” on Blipfoto's sign-in page. You can keep using your Facebook or Twitter sign-in as well. Then come back and add your extra photos."
        onDidDismiss={() => setGate(null)}
        buttons={[
          { text: 'Not now', role: 'cancel' },
          { text: 'Open Blipfoto sign-in', handler: () => void openUrl(SIGN_IN_URL) },
        ]}
      />
    </div>
  );
}
