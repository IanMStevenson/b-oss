// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-25 Journal section (FLW-17 steps 1-2): journal title, privacy (protected account), allow
// comments. Privacy is "significant" per the spec — enabling it surfaces SCR-20 (pending-request
// approval) and SCR-21 (Refused followers) elsewhere on the hub; this section itself just saves
// the flag and returns, and the hub re-fetches its own privacy-derived row visibility on every
// visit anyway (no caching for display), so no extra plumbing is needed here to make
// that "refresh" happen.

import { useEffect, useState } from 'react';
import { IonList, IonSpinner, IonText, IonAlert } from '@ionic/react';
import { fetchUserSettings, saveUserSettings } from '../../../data/settings.js';
import { describeError, mapApiError } from '../../../data/errors.js';
import { useCanWrite } from '../../../state/accountsStore.js';
import { useAppNavigate } from '../../../app/routes/useAppNavigate.js';
import {
  CaptionRow,
  FormActions,
  SectionHeader,
  TextFieldRow,
  ToggleRow,
} from '../../../components/SettingsForm.js';

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
        setLoadError(describeError(outcome, 'Could not load these settings.'));
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
      setSaveError(describeError(outcome, 'Could not save these changes.'));
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
    <div>
      <IonList>
        <SectionHeader>Your journal</SectionHeader>
        {saveError && <CaptionRow tone="danger">{saveError}</CaptionRow>}
        <TextFieldRow
          label="Journal title"
          value={form.journalTitle}
          disabled={!canWrite}
          onChange={(journalTitle) => setForm({ ...form, journalTitle })}
        />
        <ToggleRow
          label="Protected journal"
          caption="People must ask to follow you; you can refuse or remove followers."
          checked={form.privacy}
          disabled={!canWrite}
          onChange={(privacy) => setForm({ ...form, privacy })}
        />
        <ToggleRow
          label="Allow comments"
          checked={form.comments}
          disabled={!canWrite}
          onChange={(comments) => setForm({ ...form, comments })}
        />
        {!canWrite && <CaptionRow>This account is read-only.</CaptionRow>}
      </IonList>

      {canWrite && (
        <FormActions
          saving={saving}
          dirty={dirty}
          onSave={() => void handleSave()}
          onCancel={handleBack}
        />
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
