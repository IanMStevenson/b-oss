// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// `/accounts?reauth=<id>` — the header account switcher and the reauth-required push open SCR-30
// with that account's "needs to sign in again" dialog (b-oss#263). Screens don't read the router
// themselves (app-architecture.md §5), so the query is turned into a prop here. The location key
// makes each such navigation a separate request: the screen shows the dialog once per navigation
// and never again on its own (e.g. coming Back to it).
//
// `/accounts?upgrade=<id>` — the read-only upgrade prompt's "Switch to read-write" opens the
// switch-to-read-write confirmation for that account straight away (b-oss#1009).

import { useLocation } from 'react-router-dom';
import { AccountsScreen } from '../../screens/SCR-30-accounts/AccountsScreen.js';

export function AccountsRoute() {
  const { search, key } = useLocation();
  const params = new URLSearchParams(search);
  const accountId = params.get('reauth');
  const upgradeId = params.get('upgrade');
  return (
    <AccountsScreen
      reauthRequest={accountId ? { accountId, key } : undefined}
      upgradeRequest={upgradeId ? { accountId: upgradeId, key } : undefined}
    />
  );
}
