import { IonButton, IonText } from '@ionic/react';

/** Shown when the membership check failed, so "Select thumbnail" isn't silently missing (b-oss#720). */
export function MembershipCheckFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="compose-form">
      <IonText color="medium">
        <p>Couldn&apos;t check membership, so thumbnail selection is unavailable.</p>
      </IonText>
      <IonButton size="small" fill="outline" onClick={onRetry}>
        Retry
      </IonButton>
    </div>
  );
}
