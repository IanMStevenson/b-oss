// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-11 — Description Editor (§14). Two data sources, chosen by `target`:
//   - `'draft'` (default) — the two compose-flow callers, SCR-10 and SCR-13, both read/write the
//     same composeDraftStore.description field (§6); no route param needed to know what's being
//     edited beyond "whatever draft is currently open".
//   - `'bio'` (Phase 8) — SCR-25 -> Profile -> Biography, a third caller with a different data
//     source (no compose draft involved, per the TODO this mode replaces): fetches the account's
//     current biography via data/settings.ts on mount and saves it directly with `saveUserSettings`
//     on OK, entirely self-contained — ProfileSection never round-trips the text itself. Routed via
//     `/compose/description?target=bio` (AppRoutes.tsx parses the query param, §5's react-router
//     boundary).
//
// Five buttons, not four (SCR-15's comment editor excludes the link tag; entries include it, per
// §14/§21's corrected tag set) — components/BBCodeToolbar.tsx is shared between the two, this
// screen just passes the full BBCODE_TAGS.

import { useEffect, useRef, useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonAlert,
  IonSpinner,
  IonText,
} from '@ionic/react';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useComposeDraftStore } from '../../state/composeDraftStore.js';
import { fetchUserSettings, saveUserSettings } from '../../data/settings.js';
import { describeError, mapApiError } from '../../data/errors.js';
import { BBCodeToolbar } from '../../components/BBCodeToolbar.js';
import { BBCODE_TAGS } from '@b-oss/b-view';

interface DescriptionEditorScreenProps {
  target?: 'draft' | 'bio';
}

export function DescriptionEditorScreen({ target = 'draft' }: DescriptionEditorScreenProps) {
  if (target === 'bio') {
    return <BiographyEditor />;
  }
  return <DraftDescriptionEditor />;
}

function DraftDescriptionEditor() {
  const navigate = useAppNavigate();
  const draft = useComposeDraftStore((s) => s.draft);
  const patchDraft = useComposeDraftStore((s) => s.patchDraft);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const initial = draft?.description ?? '';
  const [content, setContent] = useState(initial);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const hasChanges = content !== initial;

  function handleBack(): void {
    if (hasChanges) {
      setConfirmDiscard(true);
      return;
    }
    navigate.goBack();
  }

  function handleOk(): void {
    patchDraft({ description: content });
    navigate.goBack();
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={handleBack}>Cancel</IonButton>
          </IonButtons>
          <IonTitle>Description</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={handleOk}>OK</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <BBCodeToolbar tags={BBCODE_TAGS} textareaRef={textareaRef} onChange={setContent} />
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Describe this entry…"
          rows={12}
          style={{ width: '100%', font: 'inherit', padding: 8 }}
        />
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
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={handleBack}>Cancel</IonButton>
          </IonButtons>
          <IonTitle>Biography</IonTitle>
          <IonButtons slot="end">
            <IonButton disabled={loading || saving} onClick={() => void handleOk()}>
              {saving ? <IonSpinner name="dots" /> : 'OK'}
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
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
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Tell people about yourself…"
              rows={12}
              style={{ width: '100%', font: 'inherit', padding: 8 }}
            />
          </>
        )}
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
