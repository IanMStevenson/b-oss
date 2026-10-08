// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A stand-in for api.blipfoto.com/4/ so b-mobile can run in a browser with plausible data on a
// machine with no route to the real API (the dev VM's egress is allowlisted). Serves canned,
// generated responses for every endpoint b-mobile's data layer reads, and SVG "photos". Writes
// are accepted and ignored. Used by scripts/screenshots.mjs; not a test double (the unit tests
// mock at the data layer) and not meant to be faithful beyond what the UI renders.
//
//   node scripts/stub-api.mjs [port]            # default 5192
//   B_API_PROXY_TARGET=http://127.0.0.1:5192 npx vite --port 5191 --host 127.0.0.1

import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 5192);
const ME = 'cyclopstest';
const HOST = `http://127.0.0.1:${port}`;

const hues = [150, 200, 30, 280, 10, 90, 330, 60];
const titles = [
  'Morning light',
  'Harbour wall',
  'Rain on the glass',
  'Last bus home',
  'Allotment',
  'Frost',
  'Market day',
  'Bridge at dusk',
  'Quiet street',
  'Ferns',
  'Chimney pots',
  'Tide out',
];
const people = ['gbradley', 'mossy', 'thelensman', 'wren', 'ashgrove', 'kestrel'];

const img = (seed, kind) => `${HOST}/img/${seed}/${kind}.jpg`;
const avatar = (name) => `${HOST}/img/${name}/avatar.jpg`;
const user = (username) => ({ username, avatar_url: avatar(username), icons: [] });

function entry(i, username = people[i % people.length]) {
  const d = new Date(Date.UTC(2026, 9, 7 - i));
  return {
    entry_id_str: String(5000000000 + i),
    date: d.toISOString().slice(0, 10),
    date_stamp: Math.floor(d.getTime() / 1000),
    title: titles[i % titles.length],
    username,
    location: i % 3 === 0 ? { lat: 51.45 + (i % 7) * 0.05, lon: -2.6 + (i % 5) * 0.08 } : null,
    thumbnail_url: img(i, 'thumb'),
    image_url: img(i, 'full'),
  };
}
const entries = (n, offset = 0) => Array.from({ length: n }, (_, i) => entry(i + offset));
const page = (index, size, more) => ({ index, size, more });

const comment = (i, entryId = null) => ({
  comment_id_str: String(7000 + i),
  parent_id_str: null,
  entry_id_str: entryId,
  thumbnail_url: img(i, 'thumb'),
  content: 'Lovely light on this one — the colours really work.',
  content_html: 'Lovely light on this one — the <b>colours</b> really work.',
  commenter: user(people[i % people.length]),
  actions: { reply: 1, edit: 0, delete: 0 },
  replies: null,
  unread: i < 2 ? 1 : 0,
});

const notification = (i) => ({
  notification_id_str: String(9000 + i),
  content: `${people[i % people.length]} starred your entry`,
  content_html: `<a href="https://www.blipfoto.com/${people[i % people.length]}">${people[i % people.length]}</a> starred your entry "${titles[i]}"`,
  image_url: img(i, 'thumb'),
  link_url: `https://www.blipfoto.com/entry/${5000000000 + i}`,
});

function days(year, month) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = Array.from({ length: (first + 6) % 7 }, () => null);
  for (let d = 1; d <= count; d++) {
    const has = d % 3 !== 0 && d <= 7;
    cells.push({
      day: d,
      month,
      year,
      state: has ? 1 : d > 7 ? 3 : 0,
      entry: has ? entry(7 - d) : null,
      actions: { publish: 0 },
    });
  }
  return cells;
}

const profile = (username) => ({
  user: user(username),
  visibility: 1,
  details: {
    journal_title: username === ME ? 'Everyday Light' : `${username}'s journal`,
    biography: 'A photo a day, mostly of whatever is outside the window.',
    biography_html: 'A photo a day, mostly of whatever is <b>outside</b> the window.',
    country_code: 'GB',
    entry_total: 842,
    member: 1,
    privacy: 0,
  },
  entries: { latest: entry(0, username) },
  friendship: {
    source: ME,
    target: username,
    state: username === ME ? 0 : 1,
    actions: { follow: 0, unfollow: 1 },
  },
});

const settings = {
  username: ME,
  journal_title: 'Everyday Light',
  real_name: 'Cy Clops',
  real_name_search: 0,
  biography: 'A photo a day, mostly of whatever is outside the window.',
  locale_code: 'en-GB',
  country_code: 'GB',
  privacy: 0,
  comments: 1,
  avatar_url: avatar(ME),
};

function handle(path, q) {
  const size = Number(q.get('page_size') ?? 20);
  const index = Number(q.get('page_index') ?? 0);
  const feed = () => ({
    page: page(index, size, index < 2 ? 1 : 0),
    entries: entries(Math.min(size, 24), index * 24),
  });
  switch (path) {
    case 'oauth/token':
      return {
        token: { access_token: 'stub', scope: 'read,write', token_type: 'bearer', username: ME },
        user: user(ME),
      };
    case 'user/profile':
      return profile(q.get('username') ?? ME);
    case 'user/settings':
      return settings;
    case 'user/settings/notifications': {
      const on = (keys) => ({
        configured: 1,
        settings: Object.fromEntries(keys.map((k) => [k, 1])),
      });
      return {
        feed: on([
          'feed_friends',
          'feed_entry_favorite_received',
          'feed_entry_star_received',
          'feed_publish_milestone',
          'feed_publish_followers_milestone',
          'feed_new_award',
        ]),
        email: on(['email_comment']),
        push: on(['push_comment']),
      };
    }
    case 'user/awards':
      return {
        awards: [0, 1, 2, 3].map((i) => ({
          award_id_str: String(100 + i),
          icon_url: img(i, 'thumb'),
          added_stamp: 1700000000 + i * 86400,
          secret: 0,
        })),
      };
    case 'entries/recent':
    case 'entries/popular':
    case 'entries/new':
    case 'entries/following':
    case 'entries/favorites':
    case 'entries/milestones':
    case 'entries/journal':
      return feed();
    case 'entries/search':
      // A query containing "zzz" matches nothing (reaches the no-results state).
      if ((q.get('query') ?? '').includes('zzz')) return { page: page(0, size, 0), entries: [] };
      return feed();
    case 'entry': {
      const id = Number(q.get('entry_id') ?? q.get('entry_id_str') ?? 5000000000) - 5000000000;
      const e = entry(Math.max(0, id));
      return {
        entry: e,
        details: {
          journal_title: 'Everyday Light',
          description: 'Out before work. The sun had only just cleared the roofs.',
          description_html: 'Out before work. The sun had only just cleared the <b>roofs</b>.',
          tags: ['light', 'morning', 'street'],
          views: { total: 412 },
          stars: { total: 18, starred: 0 },
          favorites: { total: 4, favorited: 0 },
        },
        metadata: {
          Make: 'Fujifilm',
          Model: 'X100V',
          ExposureTime: '1/250',
          FNumber: 'f/4',
          FocalLength: '23mm',
          ISO: '200',
          camera: 'Fujifilm X100V',
        },
        comments: {
          total: 3,
          list: [
            comment(0, e.entry_id_str),
            comment(1, e.entry_id_str),
            comment(2, e.entry_id_str),
          ],
        },
        related: {
          previous: entry(id + 1),
          next: id > 0 ? entry(id - 1) : null,
          year_ago: entry(id + 5),
          year_ahead: null,
        },
        friendships: [],
        actions: { star: 1, favorite: 1, comment: 1, edit: 1, delete: 1 },
        image_urls: {
          lores: img(id, 'thumb'),
          stdres: img(id, 'full'),
          hires: img(id, 'full'),
          original: null,
        },
      };
    }
    case 'entry/comment':
      return { comment: comment(0) };
    case 'journal/month':
      return {
        month: {
          month: Number(q.get('month') ?? 10),
          year: Number(q.get('year') ?? 2026),
          week_start: 1,
          days: days(Number(q.get('year') ?? 2026), Number(q.get('month') ?? 10)),
        },
      };
    case 'journal/day':
      return {
        day: { day: 7, month: 10, year: 2026, state: 0, entry: null, actions: { publish: 1 } },
      };
    case 'messages/comments/recent':
      return { comments: Array.from({ length: 8 }, (_, i) => comment(i, String(5000000000 + i))) };
    case 'messages/notifications/recent':
      return { notifications: Array.from({ length: 8 }, (_, i) => notification(i)) };
    case 'messages/notifications/unread':
    case 'messages/totals/unread':
      return { comments: 2, notifications: 3 };
    case 'users/followers':
    case 'users/following':
    case 'users/search':
      if ((q.get('query') ?? '').includes('zzz')) return { page: page(0, 20, 0), users: [] };
      return { page: page(0, 20, 0), users: people.map(user) };
    case 'users/requests/pending':
    case 'users/requests/blocked':
      return { page: page(0, 20, 0), users: people.map(user) };
    case 'config/countries':
      return {
        countries: [
          // Deliberately unsorted and long enough to scroll, so the picker's sort and
          // scroll-to-selection are visible.
          { country_code: 'GB', title: 'United Kingdom' },
          ...[
            ['IE', 'Ireland'],
            ['US', 'United States'],
            ['FR', 'France'],
            ['DE', 'Germany'],
            ['ES', 'Spain'],
            ['IT', 'Italy'],
            ['NL', 'Netherlands'],
            ['SE', 'Sweden'],
            ['NO', 'Norway'],
            ['DK', 'Denmark'],
            ['PL', 'Poland'],
            ['PT', 'Portugal'],
            ['AU', 'Australia'],
            ['CA', 'Canada'],
            ['NZ', 'New Zealand'],
            ['JP', 'Japan'],
            ['IN', 'India'],
            ['BR', 'Brazil'],
            ['AR', 'Argentina'],
            ['ZA', 'South Africa'],
            ['CH', 'Switzerland'],
            ['AT', 'Austria'],
            ['BE', 'Belgium'],
            ['GR', 'Greece'],
            ['FI', 'Finland'],
            ['MX', 'Mexico'],
            ['TR', 'Turkey'],
            ['EG', 'Egypt'],
          ].map(([country_code, title]) => ({ country_code, title })),
        ],
      };
    case 'config/locales':
      return { locales: [{ locale_code: 'en-GB', title: 'English (UK)' }] };
    case 'config/terms':
      return { reserved: [] };
    default:
      return { success: 1 };
  }
}

function svg(seed, kind) {
  const n = Number.isNaN(Number(seed))
    ? [...String(seed)].reduce((a, c) => a + c.charCodeAt(0), 0)
    : Number(seed);
  const h = hues[n % hues.length];
  // Every third photo is portrait, so lightbox fit/zoom is exercised in both orientations.
  const portrait = !Number.isNaN(Number(seed)) && Number(seed) % 3 === 2;
  const [w, hgt] =
    kind === 'avatar'
      ? [128, 128]
      : kind === 'thumb'
        ? [300, 300]
        : portrait
          ? [800, 1200]
          : [1200, 800];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},55%,62%)"/><stop offset="1" stop-color="hsl(${(h + 50) % 360},60%,28%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w * 0.7}" cy="${hgt * 0.3}" r="${hgt * 0.12}" fill="rgba(255,255,255,.55)"/></svg>`;
}

createServer((req, res) => {
  const url = new URL(req.url, HOST);
  const send = (status, type, body) => {
    res.writeHead(status, {
      'content-type': type,
      'access-control-allow-origin': '*',
      'x-ratelimit-limit': '100',
      'x-ratelimit-remaining': '99',
      'x-ratelimit-reset': '900',
    });
    res.end(body);
  };
  const img = url.pathname.match(/^\/img\/([^/]+)\/(\w+)\.jpg$/);
  if (img) return send(200, 'image/svg+xml', svg(img[1], img[2]));
  // The proxy rewrites /api/blipfoto/4/x.json -> /4/x.json.
  const m = url.pathname.match(/^\/4\/(.+?)(?:\.json)?$/);
  if (!m) return send(404, 'text/plain', 'not found');
  send(
    200,
    'application/json',
    JSON.stringify({ version: 4, error: null, data: handle(m[1], url.searchParams) }),
  );
}).listen(port, '127.0.0.1', () => console.log(`stub API on ${HOST}`));
