// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-19 — Followers / Following. One component for both lists (FLW-08's underlying data shape
// is identical; only the fetcher, title, and "own followers get Remove follower" condition
// differ). Not a route param for `mode` — the two routes (`/user/:username/followers` and
// `/user/:username/following`) are distinct paths per §5, so AppRoutes.tsx passes it as a prop.

import { useState } from 'react';
import { IonPage, IonHeader, IonContent } from '@ionic/react';
import { AppHeader } from '../../components/AppHeader.js';
import { PeopleList } from '../../components/PeopleList.js';
import { useScrollResume } from '../../data/useScrollResume.js';
import { useActiveAccount } from '../../state/accountsStore.js';

interface FollowersFollowingScreenProps {
  username: string;
  mode: 'followers' | 'following';
}

export function FollowersFollowingScreen({ username, mode }: FollowersFollowingScreenProps) {
  const activeAccount = useActiveAccount();
  const [ready, setReady] = useState(false);
  const scroll = useScrollResume(
    `people:${activeAccount?.id ?? 'anon'}:${mode}:${username}`,
    ready,
  );
  return (
    <IonPage>
      <IonHeader>
        <AppHeader
          title={mode === 'followers' ? 'Followers' : 'Following'}
          variant="back"
          backHref={`/user/${encodeURIComponent(username)}`}
          accountIndicator
        />
      </IonHeader>
      <IonContent {...scroll}>
        <PeopleList username={username} mode={mode} onReady={setReady} />
      </IonContent>
    </IonPage>
  );
}
