// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// How a website extras update ended (b-oss#1037, b-oss#1041), on the screen shown after publishing
// or saving. Anything short of full success says what happened and offers the entry's edit page,
// where the member can finish by hand.

import { IonButton, IonText } from '@ionic/react';
import { describeExtrasFailure, type ExtrasOutcome } from '../flows/extrasFlow.js';
import { openUrl } from '../platform/browser.js';

function plural(n: number): string {
  return n === 1 ? 'photo' : 'photos';
}

export function ExtrasResult({
  outcome,
  lead = 'Your entry is published',
}: {
  outcome: ExtrasOutcome;
  /** What is already true, e.g. 'Your entry is published' or 'Your changes are saved'. */
  lead?: string;
}) {
  if (outcome.kind === 'done') {
    const parts: string[] = [];
    if (outcome.added > 0) parts.push(`${outcome.added} extra ${plural(outcome.added)} added`);
    if (outcome.removed > 0) {
      parts.push(`${outcome.removed} extra ${plural(outcome.removed)} removed`);
    }
    return (
      <IonText color="success">
        <p>{parts.join(', ')}.</p>
      </IonText>
    );
  }
  const summary =
    outcome.kind === 'partial'
      ? `${outcome.added} of ${outcome.total} extra photo changes were made.`
      : describeExtrasFailure(outcome.reason);
  return (
    <div role="alert">
      <IonText color="warning">
        <p>
          {lead}, but not all of your extra photo changes were made. {summary} You can finish them
          on Blipfoto's edit page in your browser.
        </p>
      </IonText>
      <IonButton expand="block" fill="outline" onClick={() => void openUrl(outcome.editUrl)}>
        Open the edit page
      </IonButton>
    </div>
  );
}
