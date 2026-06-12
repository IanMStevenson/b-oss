// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import React, { createContext, useContext, useEffect, useReducer } from 'react';
import type { BackendContext } from '../backend.js';
import { reducer, initialState } from './reducer.js';
import type { AppState, AppAction } from './reducer.js';

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  backend: BackendContext;
}

export const AppContext = createContext<AppContextValue>(null!);

export function useApp(): AppContextValue {
  return useContext(AppContext);
}

export function AppProvider({
  backend,
  children,
}: {
  backend: BackendContext;
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    backend
      .getBootState()
      .then((bs) => dispatch({ type: 'boot:resolved', state: bs }))
      .catch(() => {
        // boot state load failure — leave bootStage 'loading', UI shows spinner
      });

    backend.notifyRendererReady();

    const unsub = backend.subscribe((event) => {
      if (event.type === 'store:changed') {
        dispatch({ type: 'store:changed', store: event.store });
      }
      if (event.type === 'backup:event') {
        const e = event.event;
        if (e.type === 'started') {
          dispatch({
            type: 'backup:started',
            account_id: e.account_id,
            total: e.total_to_fetch,
            kind: e.kind,
          });
        }
        if (e.type === 'progress') {
          dispatch({
            type: 'backup:progress',
            account_id: e.account_id,
            done: e.done,
            total: e.total,
            current_date: e.current_date,
            total_archived: e.total_archived,
            phase: e.phase,
          });
        }
        if (e.type === 'rate_limited') {
          dispatch({
            type: 'backup:rate_limited',
            account_id: e.account_id,
            seconds: e.resume_in_seconds,
          });
        }
        if (e.type === 'completed') {
          dispatch({ type: 'backup:completed', account_id: e.account_id });
        }
        if (e.type === 'failed') {
          dispatch({ type: 'backup:failed', account_id: e.account_id });
        }
      }
      if (event.type === 'log:entry') {
        dispatch({ type: 'log:entry', account_id: event.account_id, entry: event.entry });
      }
    });

    return unsub;
  }, [backend]);

  return <AppContext.Provider value={{ state, dispatch, backend }}>{children}</AppContext.Provider>;
}
