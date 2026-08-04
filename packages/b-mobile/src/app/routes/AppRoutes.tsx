// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The route table (§5). Routes are lowercase and hyphenated; params are always the string form
// of an id (rules.md, Identifiers). Every route currently points at ScreenPlaceholder — each is
// replaced by its own screens/SCR-NN-*/ component in the phase that builds it. Overlays (account
// switcher, upgrade prompt, first-run explainer, confirmation dialogs) are deliberately not
// routes — see OverlayProvider.

import { lazy, Suspense } from 'react';
import { Switch, Route, Redirect } from 'react-router-dom';
import type { RouteComponentProps } from 'react-router-dom';
import { IonPage, IonSpinner } from '@ionic/react';
import { ScreenPlaceholder } from '../../components/ScreenPlaceholder.js';
import { SignInScreen } from '../../screens/SCR-01-sign-in/SignInScreen.js';
import { AccountsScreen } from '../../screens/SCR-30-accounts/AccountsScreen.js';
import { BrowseScreen } from '../../screens/SCR-02-browse/BrowseScreen.js';
import { SearchScreen } from '../../screens/SCR-03-search/SearchScreen.js';
import { TagEntriesScreen } from '../../screens/SCR-05-tag-entries/TagEntriesScreen.js';
import { EntryDetailScreen } from '../../screens/SCR-06-entry-detail/EntryDetailScreen.js';
import { PhotoScreen } from '../../screens/SCR-07-full-screen-photo/PhotoScreen.js';
import { EntryMetadataScreen } from '../../screens/SCR-08-entry-metadata/EntryMetadataScreen.js';
import { NewEntryScreen } from '../../screens/SCR-09-new-entry/NewEntryScreen.js';
import { DescriptionEditorScreen } from '../../screens/SCR-11-description-editor/DescriptionEditorScreen.js';
import { EditEntryScreen } from '../../screens/SCR-13-edit-entry/EditEntryScreen.js';
import { UploadProgressScreen } from '../../screens/SCR-14-upload-progress/UploadProgressScreen.js';
import { NewCommentScreen } from '../../screens/SCR-15-new-comment/NewCommentScreen.js';
import { ReportEntryScreen } from '../../screens/SCR-16-report-entry/ReportEntryScreen.js';
import { HiddenMembersScreen } from '../../screens/SCR-31-hidden-members/HiddenMembersScreen.js';
import { ProfileScreen } from '../../screens/SCR-17-18-profile/ProfileScreen.js';
import { FollowersFollowingScreen } from '../../screens/SCR-19-followers-following/FollowersFollowingScreen.js';
import { PendingRequestsScreen } from '../../screens/SCR-20-pending-requests/PendingRequestsScreen.js';
import { RefusedFollowersScreen } from '../../screens/SCR-21-refused-followers/RefusedFollowersScreen.js';
import { AwardsScreen } from '../../screens/SCR-22-awards/AwardsScreen.js';
import { WriteGuardRoute } from './WriteGuardRoute.js';

// MapLibre GL JS is by far the app's largest dependency (~19MB unpacked, app-architecture.md
// §20) and only SCR-04/SCR-12 need it — lazy-loaded so it ships as its own chunk, fetched only
// when a map destination is actually opened, rather than inflating every screen's first paint.
const MapScreen = lazy(() =>
  import('../../screens/SCR-04-map/MapScreen.js').then((m) => ({ default: m.MapScreen })),
);
const LocationPickerScreen = lazy(() =>
  import('../../screens/SCR-12-location-picker/LocationPickerScreen.js').then((m) => ({
    default: m.LocationPickerScreen,
  })),
);
// react-easy-crop (§15) is the other notably-sized Phase 7 dependency, pulled in by
// components/PhotoCropper.tsx, which only SCR-10 (compose) uses — checked against npm run
// build's own chunk output (see AGENT_LOG.md's Phase 7 entry) before lazy-loading this route too.
const ComposeEntryScreen = lazy(() =>
  import('../../screens/SCR-10-compose-entry-details/ComposeEntryScreen.js').then((m) => ({
    default: m.ComposeEntryScreen,
  })),
);

// Shared Suspense fallback for every lazy-loaded route above.
function LazyScreenFallback() {
  return (
    <IonPage>
      <div className="ion-padding" style={{ display: 'flex', justifyContent: 'center' }}>
        <IonSpinner />
      </div>
    </IonPage>
  );
}

function placeholder(screenId: string, title: string) {
  return () => <ScreenPlaceholder screenId={screenId} title={title} />;
}

interface CommentRouteState {
  replyToCommentId?: string;
  editCommentId?: string;
  editInitialContent?: string;
}

interface ReportRouteState {
  targetUsername?: string;
  reportedComment?: { username: string; excerpt: string };
}

interface EditEntryRouteState {
  mode?: 'details' | 'photo';
}

export function AppRoutes() {
  return (
    <Switch>
      <Route exact path="/browse" component={BrowseScreen} />
      <Route exact path="/search" component={SearchScreen} />
      <Route
        exact
        path="/map"
        render={({ location }: RouteComponentProps) => {
          const params = new URLSearchParams(location.search);
          return (
            <Suspense fallback={<LazyScreenFallback />}>
              <MapScreen focusedEntryId={params.get('entry') ?? undefined} />
            </Suspense>
          );
        }}
      />
      <Route
        exact
        path="/tag/:tag"
        render={({ match }: RouteComponentProps<{ tag: string }>) => (
          <TagEntriesScreen tag={decodeURIComponent(match.params.tag)} />
        )}
      />
      <Route
        exact
        path="/entry/:entryId"
        render={({ match }: RouteComponentProps<{ entryId: string }>) => (
          <EntryDetailScreen entryId={match.params.entryId} />
        )}
      />
      <Route
        exact
        path="/entry/:entryId/photo"
        render={({ match }: RouteComponentProps<{ entryId: string }>) => (
          <PhotoScreen entryId={match.params.entryId} />
        )}
      />
      <Route
        exact
        path="/entry/:entryId/metadata"
        render={({ match }: RouteComponentProps<{ entryId: string }>) => (
          <EntryMetadataScreen entryId={match.params.entryId} />
        )}
      />
      <WriteGuardRoute
        exact
        path="/entry/:entryId/edit"
        render={({ match, location }) => {
          const state = (location.state ?? {}) as EditEntryRouteState;
          return (
            <EditEntryScreen
              entryId={match.params.entryId as string}
              initialMode={state.mode ?? 'details'}
            />
          );
        }}
      />
      <WriteGuardRoute
        exact
        path="/entry/:entryId/comment"
        render={({ match, location }) => {
          const state = (location.state ?? {}) as CommentRouteState;
          return (
            <NewCommentScreen
              entryId={match.params.entryId as string}
              replyToCommentId={state.replyToCommentId}
              editCommentId={state.editCommentId}
              editInitialContent={state.editInitialContent}
            />
          );
        }}
      />
      <WriteGuardRoute
        exact
        path="/entry/:entryId/report"
        render={({ match, location }) => {
          const state = (location.state ?? {}) as ReportRouteState;
          return (
            <ReportEntryScreen
              entryId={match.params.entryId as string}
              targetUsername={state.targetUsername}
              reportedComment={state.reportedComment}
            />
          );
        }}
      />
      <WriteGuardRoute exact path="/compose" component={NewEntryScreen} />
      <Route
        exact
        path="/compose/details"
        render={() => (
          <Suspense fallback={<LazyScreenFallback />}>
            <ComposeEntryScreen />
          </Suspense>
        )}
      />
      <Route exact path="/compose/description" component={DescriptionEditorScreen} />
      <Route
        exact
        path="/compose/location"
        render={() => (
          <Suspense fallback={<LazyScreenFallback />}>
            <LocationPickerScreen />
          </Suspense>
        )}
      />
      <Route exact path="/uploads" component={UploadProgressScreen} />
      <Route exact path="/me" render={() => <ProfileScreen />} />
      <Route
        exact
        path="/user/:username"
        render={({ match }) => <ProfileScreen username={match.params.username} />}
      />
      <Route
        exact
        path="/user/:username/followers"
        render={({ match }) => (
          <FollowersFollowingScreen username={match.params.username} mode="followers" />
        )}
      />
      <Route
        exact
        path="/user/:username/following"
        render={({ match }) => (
          <FollowersFollowingScreen username={match.params.username} mode="following" />
        )}
      />
      <Route exact path="/me/requests" component={PendingRequestsScreen} />
      <Route exact path="/me/refused" component={RefusedFollowersScreen} />
      <Route
        exact
        path="/user/:username/awards"
        render={({ match }) => <AwardsScreen username={match.params.username} />}
      />
      <Route exact path="/me/awards" render={() => <AwardsScreen />} />
      <Route exact path="/notifications" render={placeholder('SCR-23', 'Notifications')} />
      <Route exact path="/comments" render={placeholder('SCR-24', 'Comments')} />
      <Route exact path="/settings" render={placeholder('SCR-25', 'Settings')} />
      <Route exact path="/settings/:section" render={placeholder('SCR-25', 'Settings')} />
      <Route exact path="/help" render={placeholder('SCR-29', 'Help & Info')} />
      <Route exact path="/accounts" component={AccountsScreen} />
      <Route exact path="/hidden" component={HiddenMembersScreen} />
      <Route exact path="/sign-in" component={SignInScreen} />
      <Redirect exact from="/" to="/browse" />
    </Switch>
  );
}
