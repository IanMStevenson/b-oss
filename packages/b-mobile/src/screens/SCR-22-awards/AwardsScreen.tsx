// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-22 — Awards. Read-only, no fetch beyond the badge list itself. `user/awards` returns only
// an id + icon URL per award, no name/meaning text — there's nothing to show inline for "tap a
// badge for its meaning," so a tap goes straight to the icon guide (SCR-29, Phase 8) rather than
// an invented per-badge description.

import { IonPage, IonHeader, IonContent, IonSpinner, IonText, IonButton } from '@ionic/react';
import { AppHeader } from '../../components/AppHeader.js';
import { useResource } from '../../data/useResource.js';
import { fetchAwards } from '../../data/users.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useActiveAccount } from '../../state/accountsStore.js';
import { CachedImage } from '../../components/CachedImage.js';

interface AwardsScreenProps {
  username?: string;
}

export function AwardsScreen({ username }: AwardsScreenProps) {
  const navigate = useAppNavigate();
  const activeAccount = useActiveAccount();
  // /me/awards mounts with no username prop at all, expecting a fall-back to the signed-in
  // account — same "raw route prop instead of the resolved one" bug ProfileScreen had.
  const effectiveUsername = username ?? activeAccount?.username;
  const { state, reload } = useResource(
    () => fetchAwards(effectiveUsername),
    [effectiveUsername],
    (awards) => awards.length === 0,
  );

  return (
    <IonPage>
      <IonHeader>
        <AppHeader
          title="Awards"
          variant="back"
          backHref={username ? `/user/${encodeURIComponent(username)}` : '/me'}
        />
      </IonHeader>
      <IonContent className="ion-padding">
        {state.status === 'loading' && (
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <IonSpinner />
          </div>
        )}
        {state.status === 'error' && (
          <>
            <IonText color="danger">
              <p>{state.message}</p>
            </IonText>
            <IonButton onClick={reload}>Retry</IonButton>
          </>
        )}
        {state.status === 'empty' && <p>No awards yet.</p>}
        {state.status === 'loaded' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))',
              gap: 8,
            }}
          >
            {state.data.map((award) => (
              <button
                key={award.award_id_str}
                onClick={() => navigate.push('/help/icon-guide')}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                <CachedImage src={award.icon_url} alt="Award" style={{ width: 48, height: 48 }} />
              </button>
            ))}
          </div>
        )}
      </IonContent>
    </IonPage>
  );
}
