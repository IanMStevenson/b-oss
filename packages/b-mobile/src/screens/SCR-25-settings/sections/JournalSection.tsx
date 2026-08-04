// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-25 Journal section (FLW-17 steps 1-2): journal title, privacy (protected account), allow
// comments. Privacy is "significant" per the spec — enabling it surfaces SCR-20 (pending-request
// approval) and SCR-21 (Refused followers) elsewhere on the hub; this section itself just saves
// the flag and returns, and the hub re-fetches its own privacy-derived row visibility on every
// visit anyway (rules.md: no caching for display), so no extra plumbing is needed here to make
// that "refresh" happen.

import { useEffect, useState } from 'react';
import { IonButton, IonCheckbox, IonSpinner, IonText, IonAlert } from '@ionic/react';
import { fetchUserSettings, saveUserSettings } from '../../../data/settings.js';
import { mapApiError } from '../../../data/errors.js';
import { useCanWrite } from '../../../state/accountsStore.js';
import { useAppNavigate } from '../../../app/routes/useAppNavigate.js';

interface FormState {
  journalTitle: string;
  privacy: boolean;
  comments: boolean;
}

export function JournalSection() {
  const navigate = useAppNavigate();
  const canWrite = useCanWrite();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initial, setInitial] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchUserSettings().then(
      (settings) => {
        if (cancelled) return;
        const loaded: FormState = {
          journalTitle: settings.journal_title,
          privacy: settings.privacy === 1,
          comments: settings.comments === 1,
        };
        setInitial(loaded);
        setForm(loaded);
        setLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        const outcome = mapApiError(err);
        setLoadError(
          outcome.kind === 'message' ? outcome.message : 'Could not load these settings.',
        );
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = !!(form && initial && JSON.stringify(form) !== JSON.stringify(initial));

  function handleBack(): void {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    navigate.goBack();
  }

  async function handleSave(): Promise<void> {
    if (!form || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveUserSettings({
        journal_title: form.journalTitle,
        privacy: form.privacy ? 1 : 0,
        comments: form.comments ? 1 : 0,
      });
      navigate.goBack();
    } catch (err) {
      const outcome = mapApiError(err);
      setSaveError(outcome.kind === 'message' ? outcome.message : 'Could not save these changes.');
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="ion-padding" style={{ display: 'flex', justifyContent: 'center' }}>
        <IonSpinner />
      </div>
    );
  }

  if (loadError || !form) {
    return (
      <div className="ion-padding">
        <IonText color="danger">
          <p>{loadError ?? 'Could not load these settings.'}</p>
        </IonText>
      </div>
    );
  }

  return (
    <div className="ion-padding">
      {saveError && (
        <IonText color="danger">
          <p>{saveError}</p>
        </IonText>
      )}

      <label>
        Journal title
        <input
          type="text"
          value={form.journalTitle}
          disabled={!canWrite}
          onChange={(e) => setForm({ ...form, journalTitle: e.target.value })}
          style={{ width: '100%', font: 'inherit', padding: 8 }}
        />
      </label>

      <IonCheckbox
        checked={form.privacy}
        disabled={!canWrite}
        onIonChange={(e) => setForm({ ...form, privacy: e.detail.checked })}
      >
        Protected journal
      </IonCheckbox>
      <IonText color="medium">
        <p>
          When on, people must ask to follow you, and you can refuse a request or remove a follower.
        </p>
      </IonText>

      <IonCheckbox
        checked={form.comments}
        disabled={!canWrite}
        onIonChange={(e) => setForm({ ...form, comments: e.detail.checked })}
      >
        Allow comments
      </IonCheckbox>

      {canWrite ? (
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <IonButton disabled={saving} onClick={() => void handleSave()}>
            {saving ? <IonSpinner name="dots" /> : 'Save'}
          </IonButton>
          <IonButton fill="outline" disabled={saving} onClick={handleBack}>
            Cancel
          </IonButton>
        </div>
      ) : (
        <IonText color="medium">
          <p>This account is read-only.</p>
        </IonText>
      )}

      <IonAlert
        isOpen={confirmDiscard}
        header="Discard changes?"
        onDidDismiss={() => setConfirmDiscard(false)}
        buttons={[
          { text: 'Keep editing', role: 'cancel' },
          { text: 'Discard', role: 'destructive', handler: () => navigate.goBack() },
        ]}
      />
    </div>
  );
}
