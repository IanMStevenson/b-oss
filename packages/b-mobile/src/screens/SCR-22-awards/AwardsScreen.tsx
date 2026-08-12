// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-22 — Awards. Read-only, no fetch beyond the badge list itself. `user/awards` returns the
// full award catalog for the account, not just the ones they've earned — each entry carries
// `added_stamp` (null until earned) and `secret` (1 = not revealed until earned). Confirmed
// 2026-08-11 against a live response: an account with only 2 real awards still got all 12 catalog
// entries back, `added_stamp: null` on the other 10 — the previous version of this screen ignored
// both fields and rendered every entry as if earned, which was the bug. Names below come from the
// award slugs the user supplied (blipfoto.com doesn't expose them via this API), sentence-cased.
// `awardLabel` trusts each award's own `secret` flag rather than `added_stamp` — the assumption
// (unverified against a live earned-secret-award response, since no test account has one) is that
// the API itself clears `secret` once an award is earned, so showing "Secret" only when the flag
// is actually set is correct without this screen needing its own earned/secret interaction logic.

import {
  IonPage,
  IonHeader,
  IonContent,
  IonSpinner,
  IonText,
  IonButton,
  IonList,
} from '@ionic/react';
import { AppHeader } from '../../components/AppHeader.js';
import { useResource } from '../../data/useResource.js';
import { fetchAwards } from '../../data/users.js';
import { useActiveAccount } from '../../state/accountsStore.js';
import { CachedImage } from '../../components/CachedImage.js';
import type { BlipAward } from '@b-oss/b-api';

const AWARD_SLUGS: Record<string, string> = {
  '1': 'basics',
  '2': 'founding_member',
  '3': 'favorite_entry',
  '5': 'tag_entry',
  '6': 'geotag_entry',
  '8': 'five_contiguous_entries',
  '9': 'fifty_contiguous_entries',
  '10': 'one_hundred_contiguous_entries',
  '11': 'two_hundred_contiguous_entries',
  '12': 'four_hundred_contiguous_entries',
  '20': 'hotel_california',
  '21': 'early_bird',
};

function slugToSentenceCase(slug: string): string {
  const spaced = slug.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function awardLabel(award: BlipAward): string {
  if (award.secret) return 'Secret';
  const slug = AWARD_SLUGS[award.award_id_str];
  return slug ? slugToSentenceCase(slug) : `Award ${award.award_id_str}`;
}

interface AwardsScreenProps {
  username?: string;
}

export function AwardsScreen({ username }: AwardsScreenProps) {
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
          <IonList>
            {[...state.data]
              .sort((a, b) => Number(a.award_id_str) - Number(b.award_id_str))
              .map((award) => {
                const earned = award.added_stamp !== null;
                return (
                  <div
                    key={award.award_id_str}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '8px 0',
                      opacity: earned ? 1 : 0.35,
                    }}
                  >
                    <CachedImage
                      src={award.icon_url}
                      alt=""
                      style={{ width: 40, height: 40, flexShrink: 0 }}
                    />
                    <span>{awardLabel(award)}</span>
                  </div>
                );
              })}
          </IonList>
        )}
      </IonContent>
    </IonPage>
  );
}
