// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-11 — Description Editor (§14). This phase wires it for its two compose-flow callers,
// SCR-10 and SCR-13 — both read/write the same composeDraftStore.description field (§6), so this
// screen needs no route param or router state to know what it's editing; it edits whatever draft
// is currently open. TODO(Phase 8): SCR-25 -> Profile -> Biography is a third caller with a
// different data source (no compose draft involved) — when that lands, this screen will need a
// mode switch (e.g. a `?target=bio` route param) rather than always assuming a draft exists.
//
// Five buttons, not four (SCR-15's comment editor excludes the link tag; entries include it, per
// §14/§21's corrected tag set) — components/BBCodeToolbar.tsx is shared between the two, this
// screen just passes the full BBCODE_TAGS.

import { useRef, useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonAlert,
} from '@ionic/react';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useComposeDraftStore } from '../../state/composeDraftStore.js';
import { BBCodeToolbar } from '../../components/BBCodeToolbar.js';
import { BBCODE_TAGS } from '../../data/bbcode.js';

export function DescriptionEditorScreen() {
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
