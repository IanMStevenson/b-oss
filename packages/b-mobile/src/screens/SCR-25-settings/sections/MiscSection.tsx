// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-25 Misc section. Both fields are device-local (unaffected by which account is active,
// unlike Reminders) and persist immediately — no Save/Cancel. `confirmAccountBeforeReaction`
// gates flows/useAccountConfirmGate.tsx (built in Phase 4); this is the first UI to flip it.

import { IonCheckbox, IonText } from '@ionic/react';
import { useDevicePrefsStore } from '../../../state/devicePrefsStore.js';
import { useAccountsStore } from '../../../state/accountsStore.js';

export function MiscSection() {
  const uploadFullSize = useDevicePrefsStore((s) => s.uploadFullSize);
  const setUploadFullSize = useDevicePrefsStore((s) => s.setUploadFullSize);
  const confirmAccountBeforeReaction = useDevicePrefsStore((s) => s.confirmAccountBeforeReaction);
  const setConfirmAccountBeforeReaction = useDevicePrefsStore(
    (s) => s.setConfirmAccountBeforeReaction,
  );
  const accountCount = useAccountsStore((s) => s.accounts.length);

  return (
    <div className="ion-padding">
      <IonCheckbox
        checked={uploadFullSize}
        disabled
        onIonChange={(e) => setUploadFullSize(e.detail.checked)}
      >
        Upload full-size photos
      </IonCheckbox>
      <IonText color="medium">
        <p>
          Photo downscaling isn&rsquo;t implemented yet — entries always upload at full size
          regardless of this setting for now.
        </p>
      </IonText>

      {accountCount >= 2 && (
        <>
          <IonCheckbox
            checked={confirmAccountBeforeReaction}
            onIonChange={(e) => setConfirmAccountBeforeReaction(e.detail.checked)}
          >
            Confirm account before Star, Favourite or comment
          </IonCheckbox>
          <IonText color="medium">
            <p>
              With multiple accounts stored, ask which one to act as before each of these actions
              instead of silently using whichever is active.
            </p>
          </IonText>
        </>
      )}
    </div>
  );
}
