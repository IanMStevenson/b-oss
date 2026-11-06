// Every store listing the site links to, in one place. A badge shows "coming soon" until its entry
// is `live`: to launch a store, change `state` to 'live' and add the `url`. Pages never hard-code
// store URLs; they render <StoreBadge product="..." store="..." />.
export type StoreKey = 'play' | 'chrome' | 'microsoft';

export type StoreEntry =
  | { state: 'live'; url: string }
  | { state: 'soon' };

export const STORE_NAMES: Record<StoreKey, string> = {
  play: 'Google Play',
  chrome: 'the Chrome Web Store',
  microsoft: 'the Microsoft Store',
};

export const STORES = {
  'b-mobile': {
    play: {
      state: 'live',
      url: 'https://play.google.com/store/apps/details?id=uk.co.salientpoint.bmobile',
    },
  },
  'b-mobile-windows': {
    microsoft: { state: 'soon' },
  },
  'b-ark': {
    microsoft: {
      state: 'live',
      url: 'https://apps.microsoft.com/detail/9P736ZD76DC5',
    },
  },
  'b-ark-chrome': {
    chrome: {
      state: 'live',
      url: 'https://chromewebstore.google.com/detail/b-ark-chrome/apcmndghbieclompadigikblmlafccpe',
    },
  },
} as const satisfies Record<string, Partial<Record<StoreKey, StoreEntry>>>;

export type ProductKey = keyof typeof STORES;
