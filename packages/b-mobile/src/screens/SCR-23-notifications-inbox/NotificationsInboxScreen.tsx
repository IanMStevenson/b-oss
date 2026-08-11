// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-23 — Notifications Inbox (FLW-15/16). Account-gated via AccountGuardRoute (AppRoutes.tsx),
// since this screen is reachable from a tapped push while signed out (FLW-16 step 3), unlike most
// other account-scoped screens whose only entry point is a nav item that's itself hidden while
// signed out.
//
// Fetching *is* what marks these items read (endpoints.md) — there is no separate call, and the
// unread badge is cleared locally the moment the fetch starts (FLW-15 step 2), not derived from
// the response afterward.
//
// `notification.content` genuinely is BBCode (confirmed against a live response — e.g. a follow
// notification's own "[url=...]see all requests[/url]"), so it goes through the same BBCodeText
// component every other BBCode field in this app does — never `dangerouslySetInnerHTML` (§14's
// app-wide ban) via `content_html`. The row's own primary tap target (the avatar) still routes via
// `resolveNotificationTarget` (data/notifications.ts, reading `link_url`); BBCodeText's own inline
// links are a separate, complementary mechanism for whatever `[url=]` tags `content` itself
// carries — the two often point at related but not identical destinations (e.g. a follow
// notification's inline link goes straight to the requests list, matching `link_url` for that
// case, but that's not guaranteed for every notification kind).
//
// No per-notification date grouping: `BlipNotification` (b-api's own type) carries no date/
// timestamp field at all — the API never sends one — so there's nothing to group by. The
// reference (blipfoto.com's own web client) groups by date, but must derive it from something
// this endpoint doesn't expose to us.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonContent,
  IonSpinner,
  IonText,
  IonButton,
  IonRefresher,
  IonRefresherContent,
} from '@ionic/react';
import type { RefresherEventDetail } from '@ionic/core';
import { BBCodeText } from '@b-oss/b-view';
import { AppHeader } from '../../components/AppHeader.js';
import { AccountIndicator } from '../../components/AccountIndicator.js';
import {
  fetchRecentNotifications,
  isNotificationFromHiddenMember,
  resolveNotificationTarget,
} from '../../data/notifications.js';
import { describeError, mapApiError } from '../../data/errors.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useHiddenMembers } from '../../state/hiddenMembersStore.js';
import { useNotificationCountsStore } from '../../state/notificationCountsStore.js';
import { openUrl } from '../../platform/browser.js';
import { CachedImage } from '../../components/CachedImage.js';
import type { BlipNotification } from '@b-oss/b-api';

type Status = 'loading' | 'loaded' | 'empty' | 'error';

export function NotificationsInboxScreen() {
  const navigate = useAppNavigate();
  const hiddenUsernames = useHiddenMembers();
  const clearNotifications = useNotificationCountsStore((s) => s.clearNotifications);

  const [status, setStatus] = useState<Status>('loading');
  const [items, setItems] = useState<BlipNotification[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const latestIdRef = useRef<string | null>(null);

  const load = useCallback(() => {
    // Optimistic local clear, at the same moment the fetch (the real, server-side clear) starts
    // — FLW-15 step 2.
    clearNotifications();
    setStatus('loading');
    setErrorMessage(null);
    fetchRecentNotifications().then(
      (notifications) => {
        latestIdRef.current = notifications[0]?.notification_id_str ?? null;
        setItems(notifications);
        setStatus(notifications.length === 0 ? 'empty' : 'loaded');
      },
      (err: unknown) => {
        const outcome = mapApiError(err);
        setErrorMessage(describeError(outcome, 'Could not load notifications.'));
        setStatus('error');
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function handleRefresh(event: CustomEvent<RefresherEventDetail>): void {
    fetchRecentNotifications(latestIdRef.current ?? undefined).then(
      (fresh) => {
        if (fresh.length > 0) {
          latestIdRef.current = fresh[0].notification_id_str;
          setItems((prev) => [...fresh, ...prev]);
          setStatus('loaded');
        }
        event.detail.complete();
      },
      () => event.detail.complete(),
    );
  }

  function handleTap(notification: BlipNotification): void {
    const target = resolveNotificationTarget(notification);
    if (target.kind === 'entry') {
      navigate.push(`/entry/${encodeURIComponent(target.entryId)}`);
    } else if (target.kind === 'profile') {
      navigate.push(`/user/${encodeURIComponent(target.username)}`);
    } else if (target.kind === 'follow-request') {
      navigate.push('/me/requests');
    } else {
      void openUrl(target.url);
    }
  }

  const visibleItems = items.filter((n) => !isNotificationFromHiddenMember(n, hiddenUsernames));

  return (
    <IonPage>
      <IonHeader>
        <AppHeader
          title="Notifications"
          variant="back"
          backHref="/browse"
          end={<AccountIndicator />}
        />
      </IonHeader>
      <IonContent>
        {status === 'loading' && (
          <div className="ion-padding" style={{ display: 'flex', justifyContent: 'center' }}>
            <IonSpinner />
          </div>
        )}
        {status === 'error' && (
          <div className="ion-padding">
            <IonText color="danger">
              <p>{errorMessage}</p>
            </IonText>
            <IonButton onClick={load}>Retry</IonButton>
          </div>
        )}
        {status === 'empty' && (
          <div className="ion-padding">
            <p>No notifications yet.</p>
          </div>
        )}
        {(status === 'loaded' || status === 'empty') && (
          <>
            <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
              <IonRefresherContent />
            </IonRefresher>
            {visibleItems.map((notification) => (
              <div
                key={notification.notification_id_str}
                style={{
                  display: 'flex',
                  gap: 12,
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--line-2)',
                }}
              >
                <button
                  onClick={() => handleTap(notification)}
                  aria-label="Open"
                  style={{ flexShrink: 0 }}
                >
                  {notification.image_url ? (
                    <CachedImage
                      src={notification.image_url}
                      alt=""
                      style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      style={{
                        width: 48,
                        height: 48,
                        borderRadius: 6,
                        background: 'var(--bg-alt)',
                      }}
                    />
                  )}
                </button>
                <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
                  <BBCodeText
                    source={notification.content}
                    onLinkClick={(href) => void openUrl(href)}
                  />
                </div>
              </div>
            ))}
          </>
        )}
      </IonContent>
    </IonPage>
  );
}
