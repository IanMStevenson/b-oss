// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-13's "Extra photos" block (b-oss#1041, members only): the entry's current extras, read from
// its website edit page, with a tile to add more and a remove button on each. Nothing is sent
// until Save: removals and additions are held in the draft and applied through the website
// afterwards (flows/extrasFlow.ts applyExtras). Reading needs the website session, so without one
// the block offers the same sign-in as everywhere else (ExtrasLoginNotice); where extras cannot be
// edited at all (not a member, no session on this device) it shows nothing.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IonButton, IonText } from '@ionic/react';
import { pickPhoto } from '../platform/camera.js';
import { openUrl } from '../platform/browser.js';
import { entryEditUrl, type ExtraItem } from '@b-oss/b-api-web';
import type { ComposePhoto } from '../state/composeDraftStore.js';
import { MAX_EXTRAS, loadEditExtras } from '../flows/extrasFlow.js';

import { ExtrasLoginNotice } from './ExtrasLoginNotice.js';
import './ExtraPhotosSection.css';

interface Props {
  entryId: string;
  accountId: string;
  username: string;
  additions: ComposePhoto[];
  removals: string[];
  onChange: (next: { extras: ComposePhoto[]; extrasRemove: string[] }) => void;
  /** The last successful website read, kept in the draft (see ComposeDraft.siteExtras) so a
   * remount shows it at once instead of starting again from "loading". */
  site?: { items: ExtraItem[]; remaining: number | null };
  onRead: (site: { items: ExtraItem[]; remaining: number | null }) => void;
}

type Loaded =
  | { kind: 'loading' }
  | { kind: 'ok'; items: ExtraItem[]; remaining: number | null }
  | { kind: 'needs-login' }
  | { kind: 'wrong-account'; user: string }
  | { kind: 'unavailable' }
  | { kind: 'failed' };

export function ExtraPhotosEditor({
  entryId,
  accountId,
  username,
  additions,
  removals,
  onChange,
  site,
  onRead,
}: Props) {
  const account = useMemo(() => ({ id: accountId, username }), [accountId, username]);
  const [loaded, setLoaded] = useState<Loaded>(() =>
    site ? { kind: 'ok', ...site } : { kind: 'loading' },
  );
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  // Read only when there is no reading in the draft yet, or when asked again (sign-in, Try again).
  const haveReading = useRef(site !== undefined);
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;

  useEffect(() => {
    if (haveReading.current && attempt === 0) return;
    let cancelled = false;
    void loadEditExtras(entryId, account).then((result) => {
      if (cancelled) return;
      setLoaded(result);
      if (result.kind === 'ok') {
        haveReading.current = true;
        onReadRef.current({ items: result.items, remaining: result.remaining });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [entryId, account, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  // The member's own unsaved choices are shown whatever the website read is doing: they are in the
  // draft, and hiding them behind a read that is slow or failed looks like they were lost.
  const pendingAdditions =
    additions.length > 0 ? (
      <ul className="extra-photos-list">
        {additions.map((photo, index) => (
          <li key={`${photo.webPath}-${index}`}>
            <img src={photo.webPath} alt={`New extra photo ${index + 1}`} />
            <button
              type="button"
              className="extra-photos-remove"
              aria-label={`Remove new extra photo ${index + 1}`}
              onClick={() =>
                onChange({
                  extras: additions.filter((_, i) => i !== index),
                  extrasRemove: removals,
                })
              }
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    ) : null;

  if (loaded.kind === 'unavailable') {
    // The page offered no extras uploader: say so, with the way to look for yourself, rather than
    // quietly showing nothing.
    return (
      <div className="compose-form extra-photos">
        <IonText color="medium">
          <p>Blipfoto&apos;s edit page isn&apos;t offering extra photos for this entry.</p>
        </IonText>
        <IonButton size="small" fill="outline" onClick={() => void openUrl(entryEditUrl(entryId))}>
          Open the edit page
        </IonButton>
        {pendingAdditions}
      </div>
    );
  }
  if (loaded.kind === 'loading') {
    return (
      <div className="compose-form extra-photos">
        <IonText color="medium">
          <p>Loading extra photos…</p>
        </IonText>
        {pendingAdditions}
      </div>
    );
  }
  if (loaded.kind === 'failed') {
    return (
      <div className="compose-form extra-photos">
        <IonText color="medium">
          <p>Couldn&apos;t read this entry&apos;s extra photos from Blipfoto.</p>
        </IonText>
        <IonButton
          size="small"
          fill="outline"
          onClick={() => {
            setLoaded({ kind: 'loading' });
            reload();
          }}
        >
          Try again
        </IonButton>
        {pendingAdditions}
      </div>
    );
  }
  if (loaded.kind === 'wrong-account') {
    return (
      <div className="compose-form extra-photos">
        <ExtrasLoginNotice
          account={account}
          onSignedIn={reload}
          message={`Blipfoto's website is signed in as ${loaded.user}, but this entry is ${username}'s. Sign in as ${username} to change its extra photos.`}
          buttonLabel={`Sign in as ${username}`}
        />
        {pendingAdditions}
      </div>
    );
  }
  if (loaded.kind === 'needs-login') {
    return (
      <div className="compose-form extra-photos">
        <ExtrasLoginNotice account={account} onSignedIn={reload} />
        {pendingAdditions}
      </div>
    );
  }

  const { items, remaining: allowance } = loaded;
  const left =
    allowance === null ? null : Math.max(0, allowance - additions.length + removals.length);
  const kept = items.length - removals.length + additions.length;
  const full = kept >= MAX_EXTRAS || left === 0;

  async function addOne(): Promise<void> {
    setNotice(null);
    try {
      const photo = await pickPhoto(accountId);
      if (photo) onChange({ extras: [...additions, photo], extrasRemove: removals });
    } catch {
      setNotice("Couldn't add that photo.");
    }
  }

  function toggleRemoval(id: string): void {
    onChange({
      extras: additions,
      extrasRemove: removals.includes(id) ? removals.filter((r) => r !== id) : [...removals, id],
    });
  }

  return (
    <div className="compose-form extra-photos">
      <div className="extra-photos-head">
        <h3>Extra photos</h3>
        {left !== null && <span className="extra-photos-remaining">{left} remaining</span>}
      </div>
      <ul className="extra-photos-list">
        <li>
          <button
            type="button"
            className="extra-photos-add"
            aria-label="Add an extra photo"
            disabled={full}
            onClick={() => void addOne()}
          >
            +
          </button>
        </li>
        {items.map((item, index) => {
          const removing = removals.includes(item.id);
          return (
            <li key={item.id} className={removing ? 'extra-photos-removing' : undefined}>
              <img src={item.thumbnail} alt={`Extra photo ${index + 1}`} />
              <button
                type="button"
                className="extra-photos-remove"
                aria-label={
                  removing ? `Keep extra photo ${index + 1}` : `Remove extra photo ${index + 1}`
                }
                onClick={() => toggleRemoval(item.id)}
              >
                {removing ? '↺' : '×'}
              </button>
            </li>
          );
        })}
        {additions.map((photo, index) => (
          <li key={`${photo.webPath}-${index}`}>
            <img src={photo.webPath} alt={`New extra photo ${index + 1}`} />
            <button
              type="button"
              className="extra-photos-remove"
              aria-label={`Remove new extra photo ${index + 1}`}
              onClick={() =>
                onChange({
                  extras: additions.filter((_, i) => i !== index),
                  extrasRemove: removals,
                })
              }
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {removals.length > 0 && (
        <IonText color="medium">
          <p>
            {removals.length} extra {removals.length === 1 ? 'photo' : 'photos'} will be removed
            when you save.
          </p>
        </IonText>
      )}
      {notice && (
        <IonText color="danger">
          <p>{notice}</p>
        </IonText>
      )}
    </div>
  );
}
