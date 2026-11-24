// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// b-oss#1056: the compose/edit state matrix. The app gives its router outlet a single catch-all
// route, so opening a screen UNMOUNTS the one behind it and Back rebuilds it: every round trip is a
// remount, and anything held in component state, a ref or a per-mount read is at risk. This runs
// the REAL screens (new entry, compose details, edit, replace photo, location picker) in a router
// and, for each mode x each round trip, sets every draft field then checks every field survived.
//
// Table-driven so a new field cannot slip past: FIELD_CASES is a Record over every key of
// ComposeDraft (a missing key is a compile error) and a test checks it against DRAFT_FIELD_KIND.
// Round trips not run here: the description editor (SCR-11) is the biography editor now and has no
// compose state; thumbnailCrop is set through the store because react-easy-crop is a pointer
// gesture that jsdom cannot drive (its handler is a one-line patchDraft). See
// docs/ImplementationSpec/compose-state.md.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import type { Location, NavigateFunction } from 'react-router-dom';
import { OverlayProvider } from '../../app/OverlayProvider.js';
import { DraftNavigationGuard } from '../../app/routes/DraftNavigationGuard.js';
import { NewEntryScreen } from '../../screens/SCR-09-new-entry/NewEntryScreen.js';
import { ComposeEntryScreen } from '../../screens/SCR-10-compose-entry-details/ComposeEntryScreen.js';
import { LocationPickerScreen } from '../../screens/SCR-12-location-picker/LocationPickerScreen.js';
import { EditEntryScreen } from '../../screens/SCR-13-edit-entry/EditEntryScreen.js';
import { useAccountsStore } from '../accountsStore.js';
import {
  DRAFT_FIELD_KIND,
  draftPhotos,
  useComposeDraftStore,
  type ComposeDraft,
} from '../composeDraftStore.js';
import { resumeClear } from '../../data/resumeCache.js';
vi.setConfig({ testTimeout: 30_000 });
import { formatDateLabel } from '../../components/DateField.js';

// ---- the outside world --------------------------------------------------------------------------

const w = vi.hoisted(() => ({
  fetchEntry: vi.fn(),
  fetchUserProfile: vi.fn(),
  loadEditExtras: vi.fn(),
  readExtrasRemaining: vi.fn(),
  currentSiteUser: vi.fn(),
  signInToSite: vi.fn(),
  pickPhoto: vi.fn(),
  getCurrentPosition: vi.fn(),
  revealStoredPosition: vi.fn(),
  submitDraft: vi.fn(),
  addExtras: vi.fn(),
}));

vi.mock('../../data/entries.js', () => ({
  fetchEntry: w.fetchEntry,
  deleteEntry: vi.fn(),
  fetchEntryThumbnailUrl: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../data/users.js', () => ({ fetchUserProfile: w.fetchUserProfile }));
vi.mock('../../data/journal.js', () => ({
  fetchDayEligibility: () => Promise.resolve({ publishable: true, message: null }),
}));
vi.mock('../../flows/composeFlow.js', () => ({
  submitDraft: w.submitDraft,
  describeSubmitError: () => 'x',
}));
vi.mock('../../data/entryLocation.js', async (orig) => ({
  ...(await orig<typeof import('../../data/entryLocation.js')>()),
  revealStoredPosition: w.revealStoredPosition,
}));
vi.mock('../../platform/siteSession.js', () => ({
  siteSessionAvailable: () => true,
  siteSignOut: vi.fn(),
}));
vi.mock('../../site/access.js', () => ({
  siteAccessFor: () => Promise.resolve({ kind: 'ready' }),
  claimSiteSession: () => Promise.resolve(),
  setDesignatedExtrasAccount: () => Promise.resolve(),
  clearDesignatedExtrasAccount: () => Promise.resolve(),
}));
vi.mock('../../flows/extrasFlow.js', async (orig) => ({
  ...(await orig<typeof import('../../flows/extrasFlow.js')>()),
  loadEditExtras: w.loadEditExtras,
  addExtras: w.addExtras,
  readExtrasRemaining: w.readExtrasRemaining,
  currentSiteUser: w.currentSiteUser,
  signInToSite: w.signInToSite,
}));
vi.mock('../../platform/camera.js', async (orig) => ({
  ...(await orig<typeof import('../../platform/camera.js')>()),
  pickPhoto: w.pickPhoto,
}));
vi.mock('../../platform/geolocation.js', async (orig) => ({
  ...(await orig<typeof import('../../platform/geolocation.js')>()),
  getCurrentPosition: w.getCurrentPosition,
}));
vi.mock('../../platform/mapTiles.js', () => ({
  getTileLayerConfig: () => ({
    urlTemplate: 'https://tiles.example/{z}/{x}/{y}{r}.png',
    maxZoom: 20,
    attribution: 'mock',
  }),
  getSatelliteLayerConfig: () => null,
}));
vi.mock('../../platform/capabilities.js', async (orig) => ({
  ...(await orig<typeof import('../../platform/capabilities.js')>()),
  locationControlAvailable: () => true,
}));

// ---- the harness --------------------------------------------------------------------------------

const CHOOSE = /^Choose (a photo|from device)$/;
type Mode = 'publish' | 'edit';

const nav: { go: NavigateFunction | null; location: Location | null } = {
  go: null,
  location: null,
};
function Probe() {
  nav.go = useNavigate();
  nav.location = useLocation();
  return null;
}

function App({ start }: { start: string }) {
  return (
    <MemoryRouter initialEntries={[start]}>
      <DraftNavigationGuard>
        <Probe />
        <OverlayProvider>
          <Routes>
            <Route path="/compose" element={<NewEntryScreen />} />
            <Route path="/compose/details" element={<ComposeEntryScreen />} />
            <Route path="/compose/location" element={<LocationPickerScreen />} />
            <Route path="/entry/:id/edit" element={<EditEntryScreen entryId="e1" />} />
            <Route path="/entry/:id/edit/photo" element={<NewEntryScreen replaceEntryId="e1" />} />
            <Route path="*" element={<p>elsewhere</p>} />
          </Routes>
        </OverlayProvider>
      </DraftNavigationGuard>
    </MemoryRouter>
  );
}

const path = () => nav.location?.pathname;
const draft = (): ComposeDraft => {
  const d = useComposeDraftStore.getState().draft;
  if (!d) throw new Error('no draft');
  return d;
};
const back = () => act(() => void nav.go?.(-1));
/** The header's ← (or ☰ when the screen was not pushed): the discard guard hangs off it. */
const home = () => userEvent.click(screen.getByRole('button', { name: /b-mobile, go to Browse/ }));
const photo = (webPath: string) => ({
  webPath,
  mimeType: 'image/jpeg',
  width: 3000,
  height: 2000,
  createdAt: null,
  sizeBytes: 1_000_000,
});
const SITE_ITEM = { id: 'x1', thumbnail: 'https://example.test/x1.jpg' };
const POSITION = { lat: 51.5, lon: -0.1 };

beforeEach(() => {
  resumeClear();
  useAccountsStore.setState({
    accounts: [
      {
        id: 'a1',
        username: 'me',
        avatarUrl: null,
        appTokenScope: 'read,write',
        hasServiceToken: false,
        notificationRegistrationId: null,
        notificationStatus: null,
      },
    ],
    activeAccountId: 'a1',
    hydrated: true,
  });
  useComposeDraftStore.setState({ draft: null });
  w.fetchUserProfile.mockResolvedValue({ details: { member: 1 } });
  w.loadEditExtras.mockResolvedValue({ kind: 'ok', items: [SITE_ITEM], remaining: 90 });
  w.readExtrasRemaining.mockResolvedValue(90);
  w.currentSiteUser.mockResolvedValue('me');
  w.signInToSite.mockResolvedValue(true);
  w.getCurrentPosition.mockResolvedValue(POSITION);
  w.revealStoredPosition.mockResolvedValue(null);
  let picks = 0;
  w.pickPhoto.mockImplementation(() => Promise.resolve(photo(`blob:pick-${++picks}`)));
  w.fetchEntry.mockResolvedValue({
    entry: {
      entry_id: 'e1',
      date: '2026-01-01',
      title: 'Sunrise',
      username: 'me',
      description: 'Original',
      tags: ['dawn'],
      location: null,
      images: { thumbnail: 'https://example.test/t.jpg' },
    },
    actions: null,
  });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = ''; // Ionic's alerts live outside the tree and would leak between tests
  vi.resetAllMocks();
});

/** Opens the screen the field cases start from, as a member would. */
async function open(mode: Mode): Promise<void> {
  render(<App start={mode === 'edit' ? '/entry/e1/edit' : '/compose'} />);
  if (mode === 'edit') {
    await screen.findByDisplayValue('Sunrise');
    await screen.findByAltText('Extra photo 1'); // the entry's current extras, once read
  } else {
    await userEvent.click(await screen.findByText(CHOOSE));
    await screen.findByLabelText('Add an extra photo');
  }
}

async function typeInto(label: string, text: string): Promise<void> {
  const box = screen.getByLabelText<HTMLInputElement>(label);
  await userEvent.clear(box);
  await userEvent.type(box, text);
}

async function pickLocationOnMap(): Promise<void> {
  // Same UI in both modes: turn "Add to map" on, locate, Done.
  fireEvent(
    screen.getByLabelText('Add to map'),
    new CustomEvent('ionChange', { bubbles: true, detail: { checked: true } }),
  );
  await waitFor(() => expect(path()).toBe('/compose/location'));
  await userEvent.click(
    await waitFor(() => {
      const el = document.querySelector<HTMLElement>('.map-locate');
      if (!el) throw new Error('no locate button');
      return el;
    }),
  );
  await waitFor(() => expect(document.querySelector('.leaflet-marker-icon')).not.toBeNull());
  await userEvent.click(screen.getByText('Done'));
  await waitFor(() => expect(path()).not.toBe('/compose/location'));
}

// ---- one case per draft field -------------------------------------------------------------------

interface FieldCase {
  /** Modes where the field exists on screen; elsewhere only the store is checked. */
  modes: Mode[];
  /** Changes it the way the member would. Absent: nothing to do (loaded / identity fields). */
  set?: (mode: Mode) => Promise<void> | void;
  /** What must be true after any round trip. */
  see: (mode: Mode) => void;
}

const patch = (p: Partial<ComposeDraft>) =>
  act(() => useComposeDraftStore.getState().patchDraft(p));
const CROP = { x: 0.1, y: 0.2, w: 0.5 };

const FIELD_CASES: Record<keyof ComposeDraft, FieldCase> = {
  mode: { modes: [], see: (m) => expect(draft().mode).toBe(m) },
  accountId: { modes: [], see: () => expect(draft().accountId).toBe('a1') },
  entryId: {
    modes: [],
    see: (m) => expect(draft().entryId).toBe(m === 'edit' ? 'e1' : undefined),
  },
  dirty: { modes: [], see: () => expect(draft().dirty).toBe(true) },
  editLevel: {
    modes: [],
    see: (m) => expect(draft().editLevel).toBe(m === 'edit' ? 1 : undefined),
  },
  originalDate: {
    modes: [],
    see: (m) => expect(draft().originalDate).toBe(m === 'edit' ? '2026-01-01' : undefined),
  },
  existingImage: {
    modes: [],
    see: (m) =>
      expect(draft().existingImage).toBe(m === 'edit' ? 'https://example.test/t.jpg' : undefined),
  },
  siteExtras: {
    modes: ['edit', 'publish'],
    see: (m) =>
      m === 'edit'
        ? expect(draft().siteExtras).toEqual({ items: [SITE_ITEM], remaining: 90 })
        : expect(draft().siteExtras?.remaining).toBe(90),
  },
  title: {
    modes: ['edit', 'publish'],
    set: () => typeInto('Title', 'Changed title'),
    see: () => {
      expect(draft().title).toBe('Changed title');
      expect(screen.getByDisplayValue('Changed title')).toBeDefined();
    },
  },
  description: {
    modes: ['edit', 'publish'],
    // A rich-text box: appended to, not replaced.
    set: async () => {
      await userEvent.click(screen.getByRole('textbox', { name: 'Description' }));
      await userEvent.keyboard('ZZtyped');
      await waitFor(() => expect(draft().description).toContain('ZZtyped'));
    },
    see: () => {
      expect(draft().description).toContain('ZZtyped');
      expect(screen.getByRole('textbox', { name: 'Description' }).textContent).toContain('ZZtyped');
    },
  },
  tags: {
    modes: ['edit', 'publish'],
    set: () => typeInto('Tags (comma-separated)', 'a, b'),
    see: () => {
      expect(draft().tags).toBe('a, b');
      expect(screen.getByDisplayValue('a, b')).toBeDefined();
    },
  },
  date: {
    modes: ['edit', 'publish'],
    set: () => patch({ date: '2026-03-04' }), // MonthDatePicker is a calendar grid; same patchDraft
    see: () => {
      expect(draft().date).toBe('2026-03-04');
      expect(screen.getByLabelText(`Date: ${formatDateLabel('2026-03-04')}`)).toBeDefined();
    },
  },
  location: {
    modes: ['edit', 'publish'],
    set: pickLocationOnMap,
    see: () => expect(draft().location).toEqual(POSITION),
  },
  displayLocation: {
    modes: ['edit', 'publish'],
    see: () => {
      expect(draft().displayLocation).toBe(true);
      expect(screen.getByText('Change')).toBeDefined();
    },
  },
  thumbnailCrop: {
    modes: ['edit', 'publish'],
    set: () => patch({ thumbnailCrop: CROP }),
    see: () => expect(draft().thumbnailCrop).toEqual(CROP),
  },
  photo: {
    modes: ['edit', 'publish'],
    // New entry: the picked photo (set by open()). Edit: a replacement, through its own screen.
    set: async (m) => {
      if (m !== 'edit') return;
      await userEvent.click(screen.getByText('Replace photo'));
      await userEvent.click(await screen.findByText(CHOOSE));
      await waitFor(() => expect(path()).toBe('/entry/e1/edit'));
      await screen.findByDisplayValue('Changed title');
    },
    see: (m) => {
      expect(draft().photo?.webPath).toMatch(/^blob:pick-/);
      expect(screen.getByAltText('Thumbnail')).toBeDefined();
      if (m === 'edit') expect(screen.queryByAltText('Current photo')).toBeNull();
    },
  },
  extras: {
    modes: ['edit', 'publish'],
    set: async () => {
      await userEvent.click(screen.getByLabelText('Add an extra photo'));
    },
    see: (m) => {
      expect(draft().extras).toHaveLength(1);
      expect(
        screen.getByAltText(m === 'edit' ? 'New extra photo 1' : 'Extra photo 1'),
      ).toBeDefined();
    },
  },
  extrasRemove: {
    modes: ['edit'],
    set: async (m) => {
      if (m === 'edit') await userEvent.click(screen.getByLabelText('Remove extra photo 1'));
    },
    see: (m) => {
      if (m !== 'edit') return;
      expect(draft().extrasRemove).toEqual(['x1']);
      expect(screen.getByLabelText('Keep extra photo 1')).toBeDefined();
    },
  },
};

// The edit screen's own photo is only visible while no replacement is picked; its `see` covers it.

/** Sets every field, in an order where later ones don't disturb earlier ones. */
async function setEverything(mode: Mode): Promise<void> {
  const order: (keyof ComposeDraft)[] = [
    'title',
    'description',
    'tags',
    'date',
    'thumbnailCrop',
    'extras',
    'extrasRemove',
    'location',
    'photo',
  ];
  for (const key of order) await FIELD_CASES[key].set?.(mode);
  // A replacement photo resets the crop (it is for a different picture): set it last.
  await FIELD_CASES.thumbnailCrop.set?.(mode);
}

function seeEverything(mode: Mode): void {
  for (const [key, c] of Object.entries(FIELD_CASES)) {
    try {
      c.see(mode);
    } catch (err) {
      throw new Error(`field "${key}" after the round trip (${mode}): ${String(err)}`);
    }
  }
}

// ---- the round trips ----------------------------------------------------------------------------

interface Trip {
  name: string;
  modes: Mode[];
  run: (mode: Mode) => Promise<void>;
}

const here = (mode: Mode) => (mode === 'edit' ? '/entry/e1/edit' : '/compose/details');

async function openPicker(): Promise<void> {
  await userEvent.click(screen.getByText('Change'));
  await waitFor(() => expect(path()).toBe('/compose/location'));
  await screen.findByText('Done');
}

const TRIPS: Trip[] = [
  {
    name: 'location picker, Done',
    modes: ['edit', 'publish'],
    run: async (mode) => {
      await openPicker();
      await userEvent.click(screen.getByText('Done'));
      await waitFor(() => expect(path()).toBe(here(mode)));
    },
  },
  {
    name: 'location picker, Back without Done',
    modes: ['edit', 'publish'],
    run: async (mode) => {
      await openPicker();
      back();
      await waitFor(() => expect(path()).toBe(here(mode)));
    },
  },
  {
    name: 'replace-photo screen, Back without picking',
    modes: ['edit'],
    run: async () => {
      await userEvent.click(screen.getByText('Replace photo'));
      await screen.findByText(CHOOSE);
      back();
      await waitFor(() => expect(path()).toBe('/entry/e1/edit'));
    },
  },
  {
    name: 'replace-photo screen, picking again',
    modes: ['edit'],
    run: async () => {
      await userEvent.click(screen.getByText('Replace photo'));
      await userEvent.click(await screen.findByText(CHOOSE));
      await waitFor(() => expect(path()).toBe('/entry/e1/edit'));
      // A different picture: the crop belongs to the old one, so it starts afresh (and the
      // photo field's see() then names the new blob).
      await screen.findByDisplayValue('Changed title');
      patch({ thumbnailCrop: CROP });
    },
  },
  {
    name: 'leave (home), then Keep editing',
    modes: ['edit', 'publish'],
    run: async () => {
      await home();
      await userEvent.click(await screen.findByRole('button', { name: 'Keep editing' }));
    },
  },
  {
    name: 'a remount with nothing else (rotation, resize, a re-render of the route)',
    modes: ['edit', 'publish'],
    run: async (mode) => {
      cleanup();
      render(<App start={here(mode)} />);
      await screen.findByDisplayValue('Changed title');
    },
  },
];

describe.each<Mode>(['publish', 'edit'])('compose state, %s', (mode) => {
  describe.each(TRIPS.filter((t) => t.modes.includes(mode)))('round trip: $name', (trip) => {
    it('every field is as the member left it', async () => {
      const revoke = vi.fn<(url: string) => void>();
      URL.revokeObjectURL = revoke;
      await open(mode);
      await setEverything(mode);
      // The sets themselves have to have taken, or the trip proves nothing.
      seeEverything(mode);

      await trip.run(mode);

      // The extras block's own reads can land late; wait for it, then check the lot.
      await screen.findByAltText(mode === 'edit' ? 'New extra photo 1' : 'Extra photo 1');
      seeEverything(mode);
      // b-oss#1058: no photo the draft still holds had its blob URL revoked on the way.
      for (const p of draftPhotos(draft())) expect(revoke).not.toHaveBeenCalledWith(p.webPath);
    });
  });

  it('a refresh loses the unsaved draft by design, and lands somewhere sensible', async () => {
    await open(mode);
    await setEverything(mode);
    cleanup();
    useComposeDraftStore.setState({ draft: null }); // the page reloaded: memory is gone
    resumeClear();
    render(<App start={here(mode)} />);
    if (mode === 'edit') {
      // Re-seeded from the server: the saved values, none of the unsaved ones.
      expect(await screen.findByDisplayValue('Sunrise')).toBeDefined();
      expect(draft().dirty).toBe(false);
      expect(draft().extras ?? []).toEqual([]);
    } else {
      // Nothing to publish: back to choosing a photo (never an empty form).
      await waitFor(() => expect(path()).not.toBe('/compose/details'));
    }
  });

  it('with no changes, every trip leaves the draft clean', async () => {
    await open(mode);
    expect(draft().dirty).toBe(false);
    cleanup();
    render(<App start={here(mode)} />);
    await screen.findByLabelText('Title');
    expect(draft().dirty).toBe(false);
  });

  it('Leaving with changes asks first; Discard clears the draft', async () => {
    await open(mode);
    await typeInto('Title', 'Something');
    await home();
    await userEvent.click(await screen.findByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(useComposeDraftStore.getState().draft).toBeNull());
  });

  it('Leaving with no changes leaves without asking and clears the draft', async () => {
    await open(mode);
    await home();
    await waitFor(() => expect(useComposeDraftStore.getState().draft).toBeNull());
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
  });
});

describe('a website sign-in on the way', () => {
  it('new entry: signing in to add an extra keeps every other field', async () => {
    w.currentSiteUser.mockResolvedValueOnce(null).mockResolvedValue('me');
    render(<App start="/compose" />);
    await userEvent.click(await screen.findByText(CHOOSE));
    await typeInto('Title', 'Changed title');
    patch({ thumbnailCrop: CROP });
    await userEvent.click(await screen.findByLabelText('Add an extra photo'));
    await userEvent.click(await screen.findByRole('button', { name: 'Yes, sign in' }));
    await screen.findByAltText('Extra photo 1');
    expect(w.signInToSite).toHaveBeenCalled();
    expect(draft().title).toBe('Changed title');
    expect(draft().thumbnailCrop).toEqual(CROP);
    expect(draft().extras).toHaveLength(1);
    expect(draft().photo?.webPath).toMatch(/^blob:pick-/);
  });

  it('edit: signing in after "Extras require a web login" keeps the fields and shows the extras', async () => {
    w.currentSiteUser.mockResolvedValueOnce(null).mockResolvedValue('me');
    w.loadEditExtras
      .mockResolvedValueOnce({ kind: 'needs-login' })
      .mockResolvedValue({ kind: 'ok', items: [SITE_ITEM], remaining: 90 });
    render(<App start="/entry/e1/edit" />);
    await screen.findByDisplayValue('Sunrise');
    await typeInto('Title', 'Changed title');
    patch({ extras: [photo('blob:early')] });
    await userEvent.click(await screen.findByText('Sign in to see extras'));
    await userEvent.click(await screen.findByRole('button', { name: 'Yes, sign in' }));
    await screen.findByAltText('Extra photo 1');
    expect(draft().title).toBe('Changed title');
    expect(draft().extras).toHaveLength(1);
    expect(screen.getByAltText('New extra photo 1')).toBeDefined();
  });
});

describe('no field without a case', () => {
  it('FIELD_CASES and DRAFT_FIELD_KIND list exactly the draft fields (b-oss#1056)', () => {
    expect(Object.keys(FIELD_CASES).sort()).toEqual(Object.keys(DRAFT_FIELD_KIND).sort());
  });

  it('every input field has a way to set it, so the matrix really changes it', () => {
    for (const [key, kind] of Object.entries(DRAFT_FIELD_KIND)) {
      if (kind === 'input' && key !== 'displayLocation') {
        expect(FIELD_CASES[key as keyof ComposeDraft].set, `field ${key}`).toBeDefined();
      }
    }
  });
});

// The newest alert's button, once Ionic has finished presenting it (a click on the button it
// renders first can land on an element Stencil then replaces, and is lost).
const clickAlert = async (name: string) => {
  await waitFor(() => {
    const open = [...document.querySelectorAll('ion-alert')].filter(
      (a) => !a.classList.contains('overlay-hidden'),
    );
    if (open.length === 0) throw new Error('no alert is presented');
  });
  await act(() => new Promise((r) => setTimeout(r, 100)));
  const buttons = await screen.findAllByRole('button', { name });
  await userEvent.click(buttons[buttons.length - 1]);
};

// ---- b-oss#1057: starting another entry while a different unsaved draft is open -------------------

describe('another unsaved draft is open (b-oss#1057)', () => {
  const OTHER: ComposeDraft = {
    mode: 'publish',
    accountId: 'a1',
    photo: photo('blob:existing'),
    title: 'My unsaved entry',
    tags: '',
    description: '',
    date: '2026-02-02',
    location: null,
    displayLocation: false,
    thumbnailCrop: null,
    dirty: true,
  };
  const seed = (d: ComposeDraft) => act(() => useComposeDraftStore.getState().setDraft(d));

  it('new entry: asks before replacing; Keep editing returns to the draft untouched', async () => {
    seed(OTHER);
    render(<App start="/compose" />);
    await userEvent.click(await screen.findByText(CHOOSE));
    await screen.findByText('Discard this entry?');
    expect(draft().title).toBe('My unsaved entry');
    await clickAlert('Keep editing');
    await waitFor(() => expect(path()).toBe('/compose/details'));
    expect(draft().title).toBe('My unsaved entry');
    expect(draft().photo?.webPath).toBe('blob:existing');
  });

  it('new entry: Discard carries on with the new photo', async () => {
    seed(OTHER);
    render(<App start="/compose" />);
    await userEvent.click(await screen.findByText(CHOOSE));
    await clickAlert('Discard');
    await waitFor(() => expect(path()).toBe('/compose/details'));
    expect(draft().title).toBe('');
    expect(draft().photo?.webPath).toBe('blob:pick-1');
  });

  it('new entry: a clean draft is replaced without asking', async () => {
    seed({ ...OTHER, dirty: false });
    render(<App start="/compose" />);
    await userEvent.click(await screen.findByText(CHOOSE));
    await waitFor(() => expect(path()).toBe('/compose/details'));
    expect(draft().photo?.webPath).toBe('blob:pick-1');
  });

  it('edit: opening another entry asks first and does not load it until Discard', async () => {
    seed(OTHER);
    render(<App start="/entry/e1/edit" />);
    await screen.findByText('Discard this entry?');
    expect(w.fetchEntry).not.toHaveBeenCalled();
    expect(draft().title).toBe('My unsaved entry');
    await clickAlert('Discard');
    await screen.findByDisplayValue('Sunrise');
    expect(draft().mode).toBe('edit');
  });

  it('edit: Keep editing returns to the open draft', async () => {
    seed(OTHER);
    render(<App start="/entry/e1/edit" />);
    await clickAlert('Keep editing');
    await waitFor(() => expect(path()).toBe('/compose/details'));
    expect(draft().title).toBe('My unsaved entry');
    expect(w.fetchEntry).not.toHaveBeenCalled();
  });

  it('edit: a different entry\'s dirty edit draft says "Discard changes?"', async () => {
    seed({ ...OTHER, mode: 'edit', entryId: 'e9', photo: null });
    render(<App start="/entry/e1/edit" />);
    await screen.findByText('Discard changes?');
  });
});

// ---- b-oss#1059: any way out of an unsaved draft asks first ---------------------------------------

/** What Ionic does on the Android Back button: collects the handlers registered on `ionBackButton`
 * and runs the highest priority one. `next` stands for the router's own Back. */
function pressHardwareBack(): ReturnType<typeof vi.fn<() => void>> {
  const handlers: Array<{ priority: number; run: (next: () => void) => void }> = [];
  document.dispatchEvent(
    new CustomEvent('ionBackButton', {
      detail: {
        register: (priority: number, run: (next: () => void) => void) =>
          handlers.push({ priority, run }),
      },
    }),
  );
  const next = vi.fn<() => void>();
  const top = handlers.sort((a, b) => b.priority - a.priority)[0];
  if (top) top.run(next);
  else next();
  return next;
}

interface Exit {
  name: string;
  go: () => void;
  target: string;
}

const EXITS: Exit[] = [
  { name: 'side menu / tab: another screen', target: '/settings', go: () => nav.go?.('/settings') },
  {
    name: 'a notification or deep-link tap',
    target: '/notifications',
    go: () => nav.go?.('/notifications'),
  },
  { name: 'opening an entry from a link', target: '/entry/x9', go: () => nav.go?.('/entry/x9') },
  { name: 'opening a profile from a link', target: '/user/bob', go: () => nav.go?.('/user/bob') },
  {
    name: 'the sign-in window returning to another route',
    target: '/browse',
    go: () => nav.go?.('/browse', { replace: true }),
  },
];

describe.each<Mode>(['publish', 'edit'])(
  'leaving an unsaved draft asks first (b-oss#1059), %s',
  (mode) => {
    async function dirtyAndOpen(): Promise<void> {
      await open(mode);
      await typeInto('Title', 'Something');
      expect(draft().dirty).toBe(true);
    }

    describe.each(EXITS)('$name', (exit) => {
      it('asks, and Keep editing stays with the draft', async () => {
        await dirtyAndOpen();
        act(() => void exit.go());
        await screen.findByText(mode === 'edit' ? 'Discard changes?' : 'Discard this entry?');
        expect(path()).toBe(here(mode));
        await clickAlert('Keep editing');
        expect(path()).toBe(here(mode));
        expect(draft().title).toBe('Something');
      });

      it('Discard goes ahead and clears the draft', async () => {
        await dirtyAndOpen();
        act(() => void exit.go());
        await clickAlert('Discard');
        await waitFor(() => expect(path()).toBe(exit.target?.split('?')[0]));
        expect(useComposeDraftStore.getState().draft).toBeNull();
      });

      it('with no changes it goes ahead without asking', async () => {
        await open(mode);
        act(() => void exit.go());
        await waitFor(() => expect(path()).toBe(exit.target?.split('?')[0]));
        expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
      });
    });

    describe('Android hardware Back', () => {
      it('asks; Keep editing does not go back', async () => {
        await dirtyAndOpen();
        const next = pressHardwareBack();
        await screen.findByText(mode === 'edit' ? 'Discard changes?' : 'Discard this entry?');
        await clickAlert('Keep editing');
        expect(next).not.toHaveBeenCalled();
        expect(draft().title).toBe('Something');
      });

      it('Discard clears the draft and then goes back', async () => {
        await dirtyAndOpen();
        const next = pressHardwareBack();
        await clickAlert('Discard');
        await waitFor(() => expect(next).toHaveBeenCalledTimes(1));
        expect(useComposeDraftStore.getState().draft).toBeNull();
      });

      it('with no changes it goes back at once', async () => {
        await open(mode);
        const next = pressHardwareBack();
        expect(next).toHaveBeenCalledTimes(1);
      });

      it("from the location picker it stays inside the draft's own flow, no question", async () => {
        await open(mode);
        await setEverything(mode); // gives it a location, so the picker's "Change" is there
        await openPicker();
        const next = pressHardwareBack();
        expect(next).toHaveBeenCalledTimes(1);
        expect(
          [...document.querySelectorAll('ion-alert')].filter(
            (a) => !a.classList.contains('overlay-hidden'),
          ),
        ).toHaveLength(0);
      });
    });
  },
);

// ---- b-oss#1058: blob URLs are released when the photo is no longer wanted ---------------------------

describe('photo blob URLs are released (b-oss#1058)', () => {
  let revoke: ReturnType<typeof vi.fn<(url: string) => void>>;
  beforeEach(() => {
    revoke = vi.fn<(url: string) => void>();
    URL.revokeObjectURL = revoke;
  });

  it('Discard revokes the photo and the extras', async () => {
    await open('publish');
    patch({ extras: [photo('blob:ex1')], title: 'x' });
    await home();
    await clickAlert('Discard');
    await waitFor(() => expect(useComposeDraftStore.getState().draft).toBeNull());
    expect(revoke).toHaveBeenCalledWith('blob:pick-1');
    expect(revoke).toHaveBeenCalledWith('blob:ex1');
  });

  it('Publish with extras: the photo is released at once, the extras only after they are sent', async () => {
    let finish: (v: { kind: 'done' }) => void = () => {};
    w.submitDraft.mockResolvedValue('e5');
    w.addExtras.mockReturnValue(new Promise((r) => (finish = r)));
    await open('publish');
    patch({ extras: [photo('blob:ex1')] });
    await userEvent.click(await screen.findByText('Publish'));
    await waitFor(() => expect(w.addExtras).toHaveBeenCalled());
    expect(revoke).toHaveBeenCalledWith('blob:pick-1');
    expect(revoke).not.toHaveBeenCalledWith('blob:ex1');
    await act(() => Promise.resolve(finish({ kind: 'done' })));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:ex1'));
  });

  it('replacing the photo on the edit screen revokes the old one only', async () => {
    await open('edit');
    await userEvent.click(screen.getByText('Replace photo'));
    await userEvent.click(await screen.findByText(CHOOSE));
    await waitFor(() => expect(path()).toBe('/entry/e1/edit'));
    expect(revoke).not.toHaveBeenCalled(); // the entry's own photo is a server address
    await userEvent.click(screen.getByText('Replace photo'));
    await userEvent.click(await screen.findByText(CHOOSE));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:pick-1'));
    expect(revoke).not.toHaveBeenCalledWith('blob:pick-2');
  });
});
