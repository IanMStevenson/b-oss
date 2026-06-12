// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Electron container for the shared ToastHost: feeds it the reducer's toast
// list and a dismiss dispatcher; presentation lives in the kit.
import { ToastHost as ToastHostView } from '@b-oss/b-ark-ui-components';
import { useApp } from '../context/AppContext.js';

export function ToastHost() {
  const { state, dispatch } = useApp();
  return (
    <ToastHostView
      toasts={state.toasts}
      onDismiss={(id) => dispatch({ type: 'toast:dismiss', id })}
    />
  );
}
