// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The route table (§5). Routes are lowercase and hyphenated; params are always the string form
// of an id (rules.md, Identifiers). Every route currently points at ScreenPlaceholder — each is
// replaced by its own screens/SCR-NN-*/ component in the phase that builds it. Overlays (account
// switcher, upgrade prompt, first-run explainer, confirmation dialogs) are deliberately not
// routes — see OverlayProvider.

import { Switch, Route, Redirect } from 'react-router-dom';
import { ScreenPlaceholder } from '../../components/ScreenPlaceholder.js';
import { WriteGuardRoute } from './WriteGuardRoute.js';

function placeholder(screenId: string, title: string) {
  return () => <ScreenPlaceholder screenId={screenId} title={title} />;
}

export function AppRoutes() {
  return (
    <Switch>
      <Route exact path="/browse" render={placeholder('SCR-02', 'Browse')} />
      <Route exact path="/search" render={placeholder('SCR-03', 'Search')} />
      <Route exact path="/map" render={placeholder('SCR-04', 'Map')} />
      <Route exact path="/tag/:tag" render={placeholder('SCR-05', 'Tag Entries')} />
      <Route exact path="/entry/:entryId" render={placeholder('SCR-06', 'Entry Detail')} />
      <Route
        exact
        path="/entry/:entryId/photo"
        render={placeholder('SCR-07', 'Full-screen Photo')}
      />
      <Route
        exact
        path="/entry/:entryId/metadata"
        render={placeholder('SCR-08', 'Entry Metadata')}
      />
      <WriteGuardRoute
        exact
        path="/entry/:entryId/edit"
        render={placeholder('SCR-13', 'Edit Entry')}
      />
      <WriteGuardRoute
        exact
        path="/entry/:entryId/comment"
        render={placeholder('SCR-15', 'New Comment')}
      />
      <WriteGuardRoute
        exact
        path="/entry/:entryId/report"
        render={placeholder('SCR-16', 'Report Entry')}
      />
      <WriteGuardRoute exact path="/compose" render={placeholder('SCR-09', 'New Entry')} />
      <Route exact path="/compose/details" render={placeholder('SCR-10', 'Compose Details')} />
      <Route
        exact
        path="/compose/description"
        render={placeholder('SCR-11', 'Description Editor')}
      />
      <Route exact path="/compose/location" render={placeholder('SCR-12', 'Location Picker')} />
      <Route exact path="/uploads" render={placeholder('SCR-14', 'Upload Progress')} />
      <Route exact path="/me" render={placeholder('SCR-17', 'My Profile')} />
      <Route exact path="/user/:username" render={placeholder('SCR-18', 'User Profile')} />
      <Route exact path="/user/:username/followers" render={placeholder('SCR-19', 'Followers')} />
      <Route exact path="/user/:username/following" render={placeholder('SCR-19', 'Following')} />
      <Route exact path="/me/requests" render={placeholder('SCR-20', 'Pending Requests')} />
      <Route exact path="/me/refused" render={placeholder('SCR-21', 'Refused Followers')} />
      <Route exact path="/user/:username/awards" render={placeholder('SCR-22', 'Awards')} />
      <Route exact path="/me/awards" render={placeholder('SCR-22', 'Awards')} />
      <Route exact path="/notifications" render={placeholder('SCR-23', 'Notifications')} />
      <Route exact path="/comments" render={placeholder('SCR-24', 'Comments')} />
      <Route exact path="/settings" render={placeholder('SCR-25', 'Settings')} />
      <Route exact path="/settings/:section" render={placeholder('SCR-25', 'Settings')} />
      <Route exact path="/help" render={placeholder('SCR-29', 'Help & Info')} />
      <Route exact path="/accounts" render={placeholder('SCR-30', 'Accounts')} />
      <Route exact path="/hidden" render={placeholder('SCR-31', 'Hidden Members')} />
      <Route exact path="/sign-in" render={placeholder('SCR-01', 'Sign In')} />
      <Redirect exact from="/" to="/browse" />
    </Switch>
  );
}
