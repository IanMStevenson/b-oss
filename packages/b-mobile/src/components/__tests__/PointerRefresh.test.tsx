// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// b-oss#719: a header refresh button on mouse/trackpad devices; touch keeps pull-to-refresh only.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { IonPage, IonHeader, IonContent } from '@ionic/react';
import { AppHeader } from '../AppHeader.js';
import { PointerRefresh } from '../PointerRefresh.js';

function setPointer(fine: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: fine && query === '(pointer: fine)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

// A real IonPage (which renders <div class="ion-page">, not an <ion-page> tag) and the real
// AppHeader, so the test fails if PointerRefresh looks for the wrong container or slot.
function renderInPage(onRefresh: () => void) {
  return render(
    <MemoryRouter>
      <IonPage>
        <IonHeader>
          <AppHeader title="Test" variant="back" />
        </IonHeader>
        <IonContent>
          <PointerRefresh onRefresh={onRefresh} />
        </IonContent>
      </IonPage>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('PointerRefresh', () => {
  it('shows a Refresh button in the header slot on a fine pointer and calls the handler', async () => {
    setPointer(true);
    const onRefresh = vi.fn();
    renderInPage(onRefresh);
    await userEvent.click(screen.getByLabelText('Refresh'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('renders nothing on a coarse (touch) pointer', () => {
    setPointer(false);
    renderInPage(vi.fn());
    expect(screen.queryByLabelText('Refresh')).toBeNull();
  });
});
