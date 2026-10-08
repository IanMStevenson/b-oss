// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The route table (§5). Routes are lowercase and hyphenated; params are always the string form
// of an id. Each route renders its own screens/SCR-NN-*/ component. Overlays (account
// switcher, upgrade prompt, first-run explainer, confirmation dialogs) are deliberately not
// routes — see OverlayProvider.

import { useAccountsStore } from '../../state/accountsStore.js';
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { IonPage, IonSpinner } from '@ionic/react';
import { SignInScreen } from '../../screens/SCR-01-sign-in/SignInScreen.js';
import { BrowseScreen } from '../../screens/SCR-02-browse/BrowseScreen.js';
import { SearchScreen } from '../../screens/SCR-03-search/SearchScreen.js';
import { TagEntriesScreen } from '../../screens/SCR-05-tag-entries/TagEntriesScreen.js';
import { EntryDetailScreen } from '../../screens/SCR-06-entry-detail/EntryDetailScreen.js';
import { PhotoScreen } from '../../screens/SCR-07-full-screen-photo/PhotoScreen.js';
import { NewEntryScreen } from '../../screens/SCR-09-new-entry/NewEntryScreen.js';
import { DescriptionEditorScreen } from '../../screens/SCR-11-description-editor/DescriptionEditorScreen.js';
import { EditEntryScreen } from '../../screens/SCR-13-edit-entry/EditEntryScreen.js';
import { UploadProgressScreen } from '../../screens/SCR-14-upload-progress/UploadProgressScreen.js';
import { ReportEntryScreen } from '../../screens/SCR-16-report-entry/ReportEntryScreen.js';
import { HiddenMembersScreen } from '../../screens/SCR-31-hidden-members/HiddenMembersScreen.js';
import { ProfileScreen } from '../../screens/SCR-17-18-profile/ProfileScreen.js';
import { FollowersFollowingScreen } from '../../screens/SCR-19-followers-following/FollowersFollowingScreen.js';
import { PendingRequestsScreen } from '../../screens/SCR-20-pending-requests/PendingRequestsScreen.js';
import { RefusedFollowersScreen } from '../../screens/SCR-21-refused-followers/RefusedFollowersScreen.js';
import { AwardsScreen } from '../../screens/SCR-22-awards/AwardsScreen.js';
import { SettingsScreen } from '../../screens/SCR-25-settings/SettingsScreen.js';
import { HelpInfoScreen } from '../../screens/SCR-29-help-and-info/HelpInfoScreen.js';
import { NotificationsInboxScreen } from '../../screens/SCR-23-notifications-inbox/NotificationsInboxScreen.js';
import { CommentsInboxScreen } from '../../screens/SCR-24-comments-inbox/CommentsInboxScreen.js';
import { WriteGuardRoute } from './WriteGuardRoute.js';
import { AccountGuardRoute } from './AccountGuardRoute.js';
import { AccountsRoute } from './AccountsRoute.js';

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
// build's own chunk output before lazy-loading this route too.
const ComposeEntryScreen = lazy(() =>
  import('../../screens/SCR-10-compose-entry-details/ComposeEntryScreen.js').then((m) => ({
    default: m.ComposeEntryScreen,
  })),
);

// Ionic 9's IonRouterOutlet reads its routes straight from its children (a <Routes> whose
// children are <Route>s), so the table below is built by a plain function the shell calls inline,
// not a wrapper component the outlet couldn't see into. Each Route's `element` is a small
// component of its own where it needs params, query or router state — screens never import
// react-router themselves.

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

// Router state the entry page accepts: a reply started elsewhere (the comments inbox) opens the
// reply composer on that comment as soon as the entry loads.
interface EntryRouteState {
  replyToCommentId?: string;
}

interface ReportRouteState {
  targetUsername?: string;
  reportedComment?: { username: string; excerpt: string };
}

// Route params are always defined for the paths they're mounted on.
function useParam(name: string): string {
  return useParams()[name] as string;
}

function MapRoute() {
  const { search } = useLocation();
  return (
    <Suspense fallback={<LazyScreenFallback />}>
      <MapScreen focusedEntryId={new URLSearchParams(search).get('entry') ?? undefined} />
    </Suspense>
  );
}

function TagRoute() {
  return <TagEntriesScreen tag={decodeURIComponent(useParam('tag'))} />;
}

function EntryRoute() {
  const entryId = useParam('entryId');
  const state = useLocation().state as EntryRouteState | undefined;
  // keyed by entry so swiping to another entry starts it with fresh composer state (any
  // unsent text is kept by data/commentDrafts.ts, not by this instance).
  return (
    <EntryDetailScreen
      key={entryId}
      entryId={entryId}
      initialReplyToCommentId={state?.replyToCommentId}
    />
  );
}

function PhotoRoute() {
  return <PhotoScreen entryId={useParam('entryId')} />;
}

function EditEntryRoute() {
  return <EditEntryScreen entryId={useParam('entryId')} />;
}

function ReportEntryRoute() {
  const state = (useLocation().state ?? {}) as ReportRouteState;
  return (
    <ReportEntryScreen
      entryId={useParam('entryId')}
      targetUsername={state.targetUsername}
      reportedComment={state.reportedComment}
    />
  );
}

function UserProfileRoute() {
  return <ProfileScreen username={useParam('username')} />;
}

function FollowersRoute() {
  return <FollowersFollowingScreen username={useParam('username')} mode="followers" />;
}

function FollowingRoute() {
  return <FollowersFollowingScreen username={useParam('username')} mode="following" />;
}

function UserAwardsRoute() {
  return <AwardsScreen username={useParam('username')} />;
}

function SettingsSectionRoute() {
  return <SettingsScreen section={useParam('section')} />;
}

function HelpSectionRoute() {
  return <HelpInfoScreen section={useParam('section')} />;
}

// Keyed by the active account: what most screens show depends on who you are (follow state, stars
// and favourites, your Following feed, inboxes, settings), so switching account rebuilds the
// current screen and everything refetches. One rule here instead of every screen remembering to
// list the account in its fetch dependencies (b-oss device feedback, 2026-10-08).
function AppRouteTable() {
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  return (
    <Routes key={activeAccountId ?? 'anonymous'}>
      <Route path="/browse" element={<BrowseScreen />} />
      <Route path="/search" element={<SearchScreen />} />
      <Route path="/map" element={<MapRoute />} />
      <Route path="/tag/:tag" element={<TagRoute />} />
      <Route path="/entry/:entryId" element={<EntryRoute />} />
      <Route path="/entry/:entryId/photo" element={<PhotoRoute />} />
      <Route
        path="/entry/:entryId/edit"
        element={
          <WriteGuardRoute>
            <EditEntryRoute />
          </WriteGuardRoute>
        }
      />
      <Route
        path="/entry/:entryId/report"
        element={
          <WriteGuardRoute>
            <ReportEntryRoute />
          </WriteGuardRoute>
        }
      />
      <Route
        path="/compose"
        element={
          <WriteGuardRoute>
            <NewEntryScreen />
          </WriteGuardRoute>
        }
      />
      <Route
        path="/compose/details"
        element={
          <Suspense fallback={<LazyScreenFallback />}>
            <ComposeEntryScreen />
          </Suspense>
        }
      />
      <Route path="/compose/description" element={<DescriptionEditorScreen />} />
      <Route
        path="/compose/location"
        element={
          <Suspense fallback={<LazyScreenFallback />}>
            <LocationPickerScreen />
          </Suspense>
        }
      />
      <Route path="/uploads" element={<UploadProgressScreen />} />
      <Route path="/me" element={<ProfileScreen />} />
      <Route path="/user/:username" element={<UserProfileRoute />} />
      <Route path="/user/:username/followers" element={<FollowersRoute />} />
      <Route path="/user/:username/following" element={<FollowingRoute />} />
      <Route path="/me/requests" element={<PendingRequestsScreen />} />
      <Route path="/me/refused" element={<RefusedFollowersScreen />} />
      <Route path="/user/:username/awards" element={<UserAwardsRoute />} />
      <Route path="/me/awards" element={<AwardsScreen />} />
      <Route
        path="/notifications"
        element={
          <AccountGuardRoute>
            <NotificationsInboxScreen />
          </AccountGuardRoute>
        }
      />
      <Route
        path="/comments"
        element={
          <AccountGuardRoute>
            <CommentsInboxScreen />
          </AccountGuardRoute>
        }
      />
      <Route path="/settings" element={<SettingsScreen />} />
      <Route path="/settings/:section" element={<SettingsSectionRoute />} />
      <Route path="/help" element={<HelpInfoScreen />} />
      <Route path="/help/:section" element={<HelpSectionRoute />} />
      <Route path="/accounts" element={<AccountsRoute />} />
      <Route path="/hidden" element={<HiddenMembersScreen />} />
      <Route path="/sign-in" element={<SignInScreen />} />
      <Route path="/" element={<Navigate to="/browse" replace />} />
    </Routes>
  );
}

// Ionic 9's IonRouterOutlet keeps one view per route it can see and holds earlier pages mounted
// (hidden) behind a pushed one. The app deliberately has no view stack — a screen unmounts when
// you navigate away and Back rebuilds it, with data/resumeCache.ts restoring your place
// (app-architecture.md, "Navigation model and screen-state resume"; b-oss#183 closed as not
// planned). So the outlet is given a single catch-all route whose element is the whole table: one
// view item, with the real route switching happening inside it.
export function renderAppRoutes() {
  return (
    <Routes>
      <Route path="/*" element={<AppRouteTable />} />
    </Routes>
  );
}
