// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-11 — Description Editor (§14), now Biography only: SCR-25 -> Profile -> Biography, routed via
// `/compose/description` (kept for that route). Fetches the account's current biography via
// data/settings.ts on mount and saves it directly with `saveUserSettings` on OK. The entry
// description is no longer edited here — compose and edit-entry have it inline (ComposeForm's
// DescriptionField), as on blipfoto.com.
//
// Five buttons (entries and biographies include the link tag; SCR-15's comment editor excluded
// it) — components/BBCodeToolbar.tsx is shared, this screen just passes the full BBCODE_TAGS.

import { useEffect, useRef, useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonButton,
  IonContent,
  IonAlert,
  IonSpinner,
  IonText,
} from '@ionic/react';
import { AppHeader } from '../../components/AppHeader.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { fetchUserSettings, saveUserSettings } from '../../data/settings.js';
import { describeError, mapApiError } from '../../data/errors.js';
import '../../components/ComposeForm.css';
import { BBCodeToolbar } from '../../components/BBCodeToolbar.js';
import { BBCODE_TAGS } from '@b-oss/b-view';

export function DescriptionEditorScreen() {
  return <BiographyEditor />;
}

function BiographyEditor() {
  const navigate = useAppNavigate();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initial, setInitial] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchUserSettings().then(
      (settings) => {
        if (cancelled) return;
        setInitial(settings.biography);
        setContent(settings.biography);
        setLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        const outcome = mapApiError(err);
        setLoadError(describeError(outcome, 'Could not load your biography.'));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const hasChanges = content !== initial;

  function handleBack(): void {
    if (hasChanges) {
      setConfirmDiscard(true);
      return;
    }
    navigate.goBack();
  }

  async function handleOk(): Promise<void> {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveUserSettings({ biography: content });
      navigate.goBack();
    } catch (err) {
      const outcome = mapApiError(err);
      setSaveError(describeError(outcome, 'Could not save your biography.'));
      setSaving(false);
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <AppHeader title="Biography" variant="back" onBack={handleBack} />
      </IonHeader>
      <IonContent>
        <div className="description-editor">
          {loading ? (
            <IonSpinner />
          ) : loadError ? (
            <IonText color="danger">
              <p>{loadError}</p>
            </IonText>
          ) : (
            <>
              {saveError && (
                <IonText color="danger">
                  <p>{saveError}</p>
                </IonText>
              )}
              <BBCodeToolbar tags={BBCODE_TAGS} textareaRef={textareaRef} onChange={setContent} />
              <textarea
                ref={textareaRef}
                className="compose-field-textarea"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Tell people about yourself…"
                rows={12}
              />
              <IonButton
                expand="block"
                disabled={loading || saving}
                onClick={() => void handleOk()}
              >
                {saving ? <IonSpinner name="dots" /> : 'OK'}
              </IonButton>
            </>
          )}
        </div>
      </IonContent>

      <IonAlert
        isOpen={confirmDiscard}
        header="Discard changes?"
        onDidDismiss={() => setConfirmDiscard(false)}
        buttons={[
          { text: 'Keep editing', role: 'cancel' },
          { text: 'Discard', role: 'destructive', handler: () => navigate.goBack() },
        ]}
      />
    </IonPage>
  );
}
