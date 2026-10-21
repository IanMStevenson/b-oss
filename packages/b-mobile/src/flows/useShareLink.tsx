// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// b-oss#417: the one entry point for every Share affordance (entry pill, profile header). Opens the
// system share sheet — but first, if the journal behind the link is protected, a dialog says who
// the link will actually work for. Like useReport, the dialog is a plain declarative IonAlert the
// caller renders alongside its own JSX (`shareDialog`).
//
// Protected-ness: a caller that already knows (the profile screen has the profile in hand) passes
// `isProtected`; otherwise it's looked up from the owner's profile, cached per author. A failed
// lookup is treated as protected — a needless warning costs a tap, a silent dead link costs more.

import { useState } from 'react';
import type { ReactNode } from 'react';
import { IonAlert } from '@ionic/react';
import { fetchJournalProtected } from '../data/users.js';
import { shareLink } from '../platform/share.js';
import { t } from '../strings/index.js';

export interface ShareTarget {
  url: string;
  text: string;
  /** Whose journal the link points into — named in the warning, and looked up for protection. */
  ownerUsername: string;
  /** Already known by the caller; omitted: looked up from `ownerUsername`'s profile. */
  isProtected?: boolean;
}

async function send(target: ShareTarget): Promise<void> {
  try {
    await shareLink({
      url: target.url,
      text: target.text,
      dialogTitle: t('SHARE.dialog_title'),
    });
  } catch {
    // Nothing useful to tell the user: the sheet either opened or the device has no share target.
  }
}

export function useShareLink(): {
  share: (target: ShareTarget) => Promise<void>;
  shareDialog: ReactNode;
} {
  const [warning, setWarning] = useState<ShareTarget | null>(null);

  async function share(target: ShareTarget): Promise<void> {
    const isProtected =
      target.isProtected ?? (await fetchJournalProtected(target.ownerUsername).catch(() => true));
    if (isProtected) {
      setWarning(target);
      return;
    }
    await send(target);
  }

  const shareDialog = (
    <IonAlert
      isOpen={warning !== null}
      header={t('SHARE.protected.title')}
      message={t('SHARE.protected.body', { username: warning?.ownerUsername ?? '' })}
      onDidDismiss={() => setWarning(null)}
      buttons={[
        { text: 'Cancel', role: 'cancel' },
        {
          text: t('SHARE.protected.button_share'),
          handler: () => {
            if (warning) void send(warning);
          },
        },
      ]}
    />
  );

  return { share, shareDialog };
}
