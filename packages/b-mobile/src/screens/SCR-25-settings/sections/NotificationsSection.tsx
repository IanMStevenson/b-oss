// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-25 Notifications section, for the active account (b-oss#244). Two clearly separate parts,
// each with its own persistence model:
//
//   - **Notifications from this app** — two toggles, *Push for new comments* and *Push for new
//     notifications*, held by b-push per account per device (a local copy lives on the account
//     record so this renders without a network call), plus the check interval. There is no master
//     switch: "notifications on" means at least one toggle is on. Turning the first one on from
//     off runs the existing enable path (FLW-22's changeAccountMode: permission, the read-only
//     OAuth round for a read-write account, registration) with just that stream; changing one
//     while the other stays on is a PATCH (pushFlow.updatePushStreams); turning the last one off
//     deregisters — after a confirm only when turning back on would need a sign-in (read-write
//     accounts, whose notification read token is a separate credential that gets revoked). These
//     are token/registration actions, not content writes, so they apply immediately, no Save.
//   - **Blipfoto feed settings** — the six `feed_*` toggles (`user/settings/notifications`),
//     Save/Cancel like General/Journal. Blipfoto's own `push_*` settings are never read or written
//     any more; b-push no longer reads them either, so the old refresh-preferences ping is gone.
//
// The feed hint under *Push for new notifications*: Blipfoto never creates (or counts) a
// notification whose `feed_*` type is off, so b-push can't push about it (confirmed from
// Blipfoto's source on b-oss#244; comments are never gated). The hint is computed from the
// **saved** feed settings, not unsaved edits — it describes what Blipfoto is doing now, and it
// updates as soon as a Save succeeds.

import { useEffect, useState } from 'react';
import {
  IonAlert,
  IonButton,
  IonItem,
  IonList,
  IonListHeader,
  IonNote,
  IonSpinner,
  IonText,
  IonToggle,
} from '@ionic/react';
import {
  fetchNotificationSettings,
  saveNotificationSettings,
  type NotificationSettings,
} from '../../../data/settings.js';
import { describeError, mapApiError } from '../../../data/errors.js';
import {
  useActiveAccount,
  notificationStateOf,
  pushStreamsOf,
  reenablingNeedsSignIn,
} from '../../../state/accountsStore.js';
import type { PushStreams, StoredAccount } from '../../../state/accountsStore.js';
import { changeAccountMode, OAuthCancelledError } from '../../../flows/accountsFlow.js';
import { updatePollingInterval, updatePushStreams } from '../../../flows/pushFlow.js';
import { useDevicePrefsStore } from '../../../state/devicePrefsStore.js';
import { t, type StringKey } from '../../../strings/index.js';

type Stream = keyof PushStreams;

const FEED_TYPE_LABELS: Record<string, StringKey> = {
  feed_friends: 'SCR-25.feed_type.feed_friends',
  feed_entry_favorite_received: 'SCR-25.feed_type.feed_entry_favorite_received',
  feed_entry_star_received: 'SCR-25.feed_type.feed_entry_star_received',
  feed_publish_milestone: 'SCR-25.feed_type.feed_publish_milestone',
  feed_publish_followers_milestone: 'SCR-25.feed_type.feed_publish_followers_milestone',
  feed_new_award: 'SCR-25.feed_type.feed_new_award',
};

/** A feed key's label: the deck's wording for the six known keys, otherwise the key humanised
 * (the server defines the key set — data/settings.ts — so an unknown one still renders). */
export function feedLabel(key: string): string {
  const known = FEED_TYPE_LABELS[key];
  if (known) return t(known);
  return key
    .replace(/^feed_/, '')
    .split('_')
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** The note under *Push for new notifications*, or null when every feed type is on. */
export function feedHint(saved: Record<string, 0 | 1>): string | null {
  const keys = Object.keys(saved);
  const off = keys.filter((k) => saved[k] === 0);
  if (off.length === 0) return null;
  if (off.length === keys.length) return t('SCR-25.notifications.feed_hint.all');
  const types = off.map((k) => {
    const label = feedLabel(k);
    return label.charAt(0).toLowerCase() + label.slice(1);
  });
  return t('SCR-25.notifications.feed_hint.some', { types: joinList(types) });
}

function PushSection({
  account,
  savedFeed,
}: {
  account: StoredAccount;
  savedFeed: Record<string, 0 | 1> | null;
}) {
  const state = notificationStateOf(account);
  const on = state === 'on';
  const streams: PushStreams = on
    ? pushStreamsOf(account)
    : { comments: false, notifications: false };

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  // An Ionic toggle flips itself on tap; when the store value doesn't change (Keep on, a failure,
  // a cancelled sign-in) React has nothing to re-render, so remount the toggles to snap back.
  const [toggleKey, setToggleKey] = useState(0);

  const pollingInterval = useDevicePrefsStore((s) => s.notificationPollingIntervalMinutes);
  const setPollingInterval = useDevicePrefsStore((s) => s.setNotificationPollingIntervalMinutes);
  const [intervalError, setIntervalError] = useState<string | null>(null);
  // Typed text, committed on blur (with the 5-minute floor) so typing "20" doesn't stop at "2".
  const [intervalDraft, setIntervalDraft] = useState(String(pollingInterval));
  useEffect(() => setIntervalDraft(String(pollingInterval)), [pollingInterval]);

  const scope = account.appTokenScope;

  async function run(action: () => Promise<void>, fallback: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      if (!(err instanceof OAuthCancelledError)) {
        setError(err instanceof Error && err.message ? err.message : fallback);
      }
    } finally {
      setBusy(false);
      setToggleKey((k) => k + 1);
    }
  }

  function turnOff(): Promise<void> {
    return run(
      () => changeAccountMode(account.id, { scope: scope ?? 'read,write', notifications: false }),
      'Could not turn notifications off.',
    );
  }

  function handleToggle(stream: Stream, value: boolean): void {
    if (busy || scope === null || value === streams[stream]) return;
    const next: PushStreams = { ...streams, [stream]: value };

    if (!on) {
      // First one on from off (or needs sign-in): the enable path, with just this stream.
      void run(async () => {
        await changeAccountMode(account.id, {
          scope,
          notifications: true,
          pushStreams: next,
        });
      }, 'Could not turn notifications on.');
      return;
    }

    if (!next.comments && !next.notifications) {
      if (reenablingNeedsSignIn(account)) {
        setConfirmOff(true);
        return;
      }
      void turnOff();
      return;
    }

    void run(() => updatePushStreams(account.id, next), 'Could not change notifications.');
  }

  async function handlePollingIntervalChange(minutes: number): Promise<void> {
    const previous = pollingInterval;
    setPollingInterval(minutes); // local, immediate — matches every other local-only prefs field
    setIntervalError(null);
    // Not registered: the value is still kept locally, there's just nothing to PATCH yet.
    if (!account.notificationRegistrationId) return;
    try {
      await updatePollingInterval(account.id, minutes);
    } catch (err) {
      // Not mapApiError() — that maps b-api's error shapes, not b-push's (PushServiceError).
      setPollingInterval(previous);
      setIntervalError(err instanceof Error ? err.message : 'Could not update the check interval.');
    }
  }

  const hint = on && streams.notifications && savedFeed ? feedHint(savedFeed) : null;
  const disabled = busy || scope === null;

  return (
    <IonList>
      <IonListHeader>
        <IonNote>{t('SCR-25.notifications.app.title')}</IonNote>
      </IonListHeader>
      <IonItem lines="none">
        <IonText color="medium" className="ion-text-wrap">
          <p style={{ margin: '0 0 4px', fontSize: 14 }}>
            {t('SCR-25.notifications.app.caption', { username: account.username })}
          </p>
        </IonText>
      </IonItem>
      {state === 'needs-sign-in' && (
        <IonItem lines="none">
          <IonText color="warning" className="ion-text-wrap">
            <p style={{ margin: '0 0 4px', fontSize: 14 }}>
              {t('SCR-25.notifications.needs_sign_in', { username: account.username })}
            </p>
          </IonText>
        </IonItem>
      )}

      <IonItem key={`comments-${toggleKey}`}>
        <span>{t('SCR-25.notifications.push_comments')}</span>
        <IonToggle
          slot="end"
          aria-label={t('SCR-25.notifications.push_comments')}
          checked={streams.comments}
          disabled={disabled}
          onIonChange={(e) => handleToggle('comments', e.detail.checked)}
        />
      </IonItem>
      <IonItem key={`notifications-${toggleKey}`} lines={hint ? 'none' : undefined}>
        <span>{t('SCR-25.notifications.push_notifications')}</span>
        <IonToggle
          slot="end"
          aria-label={t('SCR-25.notifications.push_notifications')}
          checked={streams.notifications}
          disabled={disabled}
          onIonChange={(e) => handleToggle('notifications', e.detail.checked)}
        />
      </IonItem>
      {hint && (
        <IonItem>
          <IonText color="medium" className="ion-text-wrap">
            <p data-testid="feed-hint" style={{ margin: '0 0 8px', fontSize: 13 }}>
              {hint}
            </p>
          </IonText>
        </IonItem>
      )}
      {busy && (
        <IonItem lines="none">
          <IonSpinner name="dots" />
        </IonItem>
      )}
      {error && (
        <IonItem lines="none">
          <IonText color="danger">
            <p>{error}</p>
          </IonText>
        </IonItem>
      )}

      <IonItem>
        <span>{t('SCR-25.notifications.interval')}</span>
        <input
          slot="end"
          type="number"
          min={5}
          step={5}
          inputMode="numeric"
          aria-label={t('SCR-25.notifications.interval')}
          value={intervalDraft}
          onChange={(e) => setIntervalDraft(e.target.value)}
          onBlur={() => {
            const minutes = Number(intervalDraft);
            if (!Number.isFinite(minutes) || minutes < 5) {
              setIntervalDraft(String(pollingInterval));
              return;
            }
            if (minutes !== pollingInterval) void handlePollingIntervalChange(minutes);
          }}
          style={{ font: 'inherit', width: 56, textAlign: 'end' }}
        />
        <IonNote slot="end">min</IonNote>
      </IonItem>
      {intervalError && (
        <IonItem lines="none">
          <IonText color="danger">
            <p>{intervalError}</p>
          </IonText>
        </IonItem>
      )}

      <IonAlert
        isOpen={confirmOff}
        header={t('FLW22.notifications_off.title')}
        message={t('FLW22.notifications_off.body', { username: account.username })}
        onDidDismiss={() => {
          setConfirmOff(false);
          setToggleKey((k) => k + 1);
        }}
        buttons={[
          { text: t('FLW22.notifications_off.button_keep'), role: 'cancel' },
          {
            text: t('FLW22.notifications_off.button'),
            role: 'destructive',
            handler: () => void turnOff(),
          },
        ]}
      />
    </IonList>
  );
}

function FeedSection({
  initial,
  readOnly,
  onSaved,
}: {
  initial: Record<string, 0 | 1>;
  /** A read-only account sees the feed settings view-only (SCR-25: server writes need write). */
  readOnly: boolean;
  onSaved: (saved: Record<string, 0 | 1>) => void;
}) {
  const [feed, setFeed] = useState<Record<string, 0 | 1>>(initial);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const keys = Object.keys(feed);
  const dirty = JSON.stringify(feed) !== JSON.stringify(initial);

  async function handleSave(): Promise<void> {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await saveNotificationSettings(feed);
      onSaved(feed);
      setSaved(true);
    } catch (err) {
      const outcome = mapApiError(err);
      setSaveError(describeError(outcome, 'Could not save these changes.'));
    } finally {
      setSaving(false);
    }
  }

  function handleCancel(): void {
    setFeed(initial);
    setSaveError(null);
    setSaved(false);
  }

  return (
    <IonList>
      <IonListHeader>
        <IonNote>{t('SCR-25.notifications.feed.title')}</IonNote>
      </IonListHeader>
      <IonItem lines="none">
        <IonText color="medium" className="ion-text-wrap">
          <p style={{ margin: '0 0 4px', fontSize: 14 }}>
            {t('SCR-25.notifications.feed.caption')}
          </p>
        </IonText>
      </IonItem>
      {keys.map((key) => (
        <IonItem key={key}>
          <span>{feedLabel(key)}</span>
          <IonToggle
            slot="end"
            aria-label={feedLabel(key)}
            checked={feed[key] === 1}
            disabled={saving || readOnly}
            onIonChange={(e) => setFeed({ ...feed, [key]: e.detail.checked ? 1 : 0 })}
          />
        </IonItem>
      ))}
      {saveError && (
        <IonItem lines="none">
          <IonText color="danger">
            <p>{saveError}</p>
          </IonText>
        </IonItem>
      )}
      {saved && !dirty && (
        <IonItem lines="none">
          <IonNote color="success">Saved.</IonNote>
        </IonItem>
      )}
      {dirty && (
        <div className="ion-padding" style={{ display: 'flex', gap: 8 }}>
          <IonButton disabled={saving} onClick={() => void handleSave()}>
            {saving ? <IonSpinner name="dots" /> : 'Save'}
          </IonButton>
          <IonButton fill="outline" disabled={saving} onClick={handleCancel}>
            Cancel
          </IonButton>
        </div>
      )}
    </IonList>
  );
}

export function NotificationsSection() {
  const activeAccount = useActiveAccount();
  const accountId = activeAccount?.id;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savedFeed, setSavedFeed] = useState<Record<string, 0 | 1> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetchNotificationSettings().then(
      (settings: NotificationSettings) => {
        if (cancelled) return;
        setSavedFeed(settings.feed?.settings ?? {});
        setLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        const outcome = mapApiError(err);
        setLoadError(describeError(outcome, 'Could not load notification settings.'));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [accountId]);

  return (
    <div>
      {activeAccount && <PushSection account={activeAccount} savedFeed={savedFeed} />}

      {loading ? (
        <div className="ion-padding" style={{ display: 'flex', justifyContent: 'center' }}>
          <IonSpinner />
        </div>
      ) : loadError ? (
        <div className="ion-padding">
          <IonText color="danger">
            <p>{loadError}</p>
          </IonText>
        </div>
      ) : (
        savedFeed && (
          <FeedSection
            key={accountId ?? 'none'}
            initial={savedFeed}
            readOnly={activeAccount?.appTokenScope !== 'read,write'}
            onSaved={(saved) => setSavedFeed(saved)}
          />
        )
      )}
    </div>
  );
}
