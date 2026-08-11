// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-25 General section (FLW-17 step 1): real name, country, locale, find-me-by-name. Standard
// server-backed load -> edit -> Save/Cancel; Save sends only this section's own fields (the rest
// of UpdateUserSettingsParams stays undefined so a General save can't clobber Journal/Profile
// edits in flight elsewhere — see data/settings.ts's own header comment). Read-only accounts see
// the loaded values with no Save affordance (rules.md: every server-backed section writes to the
// account).

import { useEffect, useState } from 'react';
import { IonButton, IonCheckbox, IonSpinner, IonText, IonAlert } from '@ionic/react';
import { fetchUserSettings, saveUserSettings } from '../../../data/settings.js';
import { fetchCountries, fetchLocales } from '../../../data/config.js';
import type { ConfigOption } from '../../../data/config.js';
import { describeError, mapApiError } from '../../../data/errors.js';
import { useCanWrite } from '../../../state/accountsStore.js';
import { useAppNavigate } from '../../../app/routes/useAppNavigate.js';

interface FormState {
  realName: string;
  realNameSearch: boolean;
  countryCode: string;
  localeCode: string;
}

export function GeneralSection() {
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
    <div className="ion-padding">
      {saveError && (
        <IonText color="danger">
          <p>{saveError}</p>
        </IonText>
      )}

      <label style={{ display: 'block', marginBottom: 18 }}>
        Real name
        <input
          type="text"
          value={form.realName}
          disabled={!canWrite}
          onChange={(e) => setForm({ ...form, realName: e.target.value })}
          style={{ width: '100%', font: 'inherit', padding: 8, marginTop: 6 }}
        />
      </label>

      <label style={{ display: 'block', marginBottom: 18 }}>
        Country
        <select
          value={form.countryCode}
          disabled={!canWrite}
          onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
          style={{ width: '100%', font: 'inherit', padding: 8, marginTop: 6 }}
        >
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.title}
            </option>
          ))}
        </select>
      </label>

      <label style={{ display: 'block', marginBottom: 18 }}>
        Locale
        <select
          value={form.localeCode}
          disabled={!canWrite}
          onChange={(e) => setForm({ ...form, localeCode: e.target.value })}
          style={{ width: '100%', font: 'inherit', padding: 8, marginTop: 6 }}
        >
          {locales.map((l) => (
            <option key={l.code} value={l.code}>
              {l.title}
            </option>
          ))}
        </select>
      </label>

      <IonCheckbox
        checked={form.realNameSearch}
        disabled={!canWrite}
        onIonChange={(e) => setForm({ ...form, realNameSearch: e.detail.checked })}
        style={{ marginBottom: 18 }}
      >
        Let people find me by my real name
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
