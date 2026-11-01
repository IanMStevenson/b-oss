// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-25 Details & journal section (FLW-17; b-oss#734): the old General and Journal pages merged
// into one form with one Save, one `saveUserSettings` call and one discard prompt. Real name,
// country, language, find-me-by-name, journal title, protected journal, allow comments. Privacy
// ("protected") is significant — enabling it surfaces SCR-20 (pending requests) and SCR-21 (Refused
// followers); this section just saves the flag and returns, and the hub re-fetches its own
// privacy-derived row visibility on every visit (no caching for display). Save sends only this
// section's own fields (the rest of UpdateUserSettingsParams stays undefined so it can't clobber
// Profile edits elsewhere — see data/settings.ts's own header comment). Read-only accounts see the
// loaded values with no Save affordance.

import { useEffect, useState } from 'react';
import { IonList, IonSpinner, IonText, IonAlert } from '@ionic/react';
import { fetchUserSettings, saveUserSettings } from '../../../data/settings.js';
import { fetchCountries, fetchLocales } from '../../../data/config.js';
import type { ConfigOption } from '../../../data/config.js';
import { describeError, mapApiError } from '../../../data/errors.js';
import { useCanWrite } from '../../../state/accountsStore.js';
import { useAppNavigate } from '../../../app/routes/useAppNavigate.js';
import {
  CaptionRow,
  FormActions,
  SectionHeader,
  SelectRow,
  TextFieldRow,
  ToggleRow,
} from '../../../components/SettingsForm.js';

interface FormState {
  realName: string;
  realNameSearch: boolean;
  countryCode: string;
  localeCode: string;
  journalTitle: string;
  privacy: boolean;
  comments: boolean;
}

export function DetailsSection() {
  const navigate = useAppNavigate();
  const canWrite = useCanWrite();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [initial, setInitial] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [countries, setCountries] = useState<ConfigOption[]>([]);
  const [locales, setLocales] = useState<ConfigOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchUserSettings(), fetchCountries(), fetchLocales()]).then(
      ([settings, countryList, localeList]) => {
        if (cancelled) return;
        const loaded: FormState = {
          realName: settings.real_name,
          realNameSearch: settings.real_name_search === 1,
          countryCode: settings.country_code,
          localeCode: settings.locale_code,
          journalTitle: settings.journal_title,
          privacy: settings.privacy === 1,
          comments: settings.comments === 1,
        };
        setInitial(loaded);
        setForm(loaded);
        setCountries(countryList);
        setLocales(localeList);
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
        real_name: form.realName,
        real_name_search: form.realNameSearch ? 1 : 0,
        country_code: form.countryCode,
        locale_code: form.localeCode,
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
        <SectionHeader>About you</SectionHeader>
        {saveError && <CaptionRow tone="danger">{saveError}</CaptionRow>}
        <TextFieldRow
          label="Real name"
          value={form.realName}
          disabled={!canWrite}
          onChange={(realName) => setForm({ ...form, realName })}
        />
        <SelectRow
          label="Country"
          pickerTitle="Select country"
          value={form.countryCode}
          options={countries}
          disabled={!canWrite}
          onChange={(countryCode) => setForm({ ...form, countryCode })}
        />
        <SelectRow
          label="Language"
          pickerTitle="Select language"
          value={form.localeCode}
          options={locales}
          disabled={!canWrite}
          onChange={(localeCode) => setForm({ ...form, localeCode })}
        />

        <SectionHeader>Privacy</SectionHeader>
        <ToggleRow
          label="Let people find me by my real name"
          checked={form.realNameSearch}
          disabled={!canWrite}
          onChange={(realNameSearch) => setForm({ ...form, realNameSearch })}
        />

        <SectionHeader>Your journal</SectionHeader>
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
