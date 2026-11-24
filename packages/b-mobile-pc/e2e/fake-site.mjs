// A stand-in for the Blipfoto website's pages that b-mobile's website session drives (b-oss#1053).
// The shell's BMPC_SITE_ORIGIN test hook points the hidden page runs here. It reproduces what the page
// scripts depend on, not the site: a header that names the signed-in member ("My profile"), the
// sign-in page, an entry's public page with its gallery data (or the protected-journal notice), the
// owner's edit page with the extras uploader, its queue and the "N remaining" figure, and the form
// post that applies added and deleted extras. Members: `cyclopstest` (protected journal, entry 100
// with two extras) and `cyclops` (public journal, entry 200 with one). Sessions are a cookie set by
// /test/login?as=<member>; /test/reset restores the seed; /test/state shows the data.
// Usage: node fake-site.mjs [port]
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 5195);

function seed() {
  return {
    cyclopstest: {
      protected: true,
      entries: { 100: { title: 'One', extras: [{ id: 'x1' }, { id: 'x2' }] } },
    },
    cyclops: { protected: false, entries: { 200: { title: 'Other', extras: [{ id: 'y1' }] } } },
  };
}
let members = seed();
let counter = 0;

const owner = (entryId) => Object.entries(members).find(([, m]) => m.entries[entryId])?.[0] ?? null;
const total = (name) =>
  Object.values(members[name].entries).reduce((n, e) => n + e.extras.length, 0);
const remaining = (name) => 100 - total(name);
const thumb = (id) => `http://127.0.0.1:${port}/img/${id}.jpg`;

function page(viewer, body, extraHead = '') {
  const header = viewer
    ? `<header><a href="/${viewer}">My profile</a></header>`
    : '<header>Sign in</header>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>fake blipfoto</title>${extraHead}</head><body>${header}${body}</body></html>`;
}

function editPage(viewer, entryId) {
  const entry = members[viewer].entries[entryId];
  const items = entry.extras
    .map(
      (x) =>
        `<li><img src="${thumb(x.id)}"><a href="#" data-upload-id="${x.id}" class="upload-state-2"></a></li>`,
    )
    .join('');
  return page(
    viewer,
    `<form id="publisher" method="post" action="/entry/${entryId}/edit">
      <input type="text" name="title" value="${entry.title}">
      <label><input type="file" id="photo-uploader" multiple></label>
      <span id="photo-uploader-remaining">${remaining(viewer)}</span>
      <ol id="photo-queue" class="queue">${items}</ol>
      <input type="hidden" id="photos_add" name="photos_add" value="">
      <input type="hidden" id="photos_delete" name="photos_delete" value="">
      <button id="publish" type="submit" class="button large">Save changes</button>
    </form>
    <script>
      // Stands in for the site's own scripts: the page script waits for a bound change handler.
      window.jQuery = { _data: function () { return { change: [1] }; } };
      var added = [], deleted = [];
      var rem = document.getElementById('photo-uploader-remaining');
      var queue = document.getElementById('photo-queue');
      var pub = document.getElementById('publish');
      document.getElementById('photo-uploader').addEventListener('change', function (e) {
        var files = e.target.files;
        // Queuing disables Save while uploads run, then it comes back.
        pub.disabled = true;
        for (var i = 0; i < files.length; i++) {
          var id = 'n' + Date.now() + '_' + i;
          added.push({ photo_id: id, orientation: 0, width: 1, height: 1 });
          var li = document.createElement('li');
          li.innerHTML = '<img src=""><a href="#" data-upload-id="' + id + '" class="upload-state-2"></a>';
          queue.appendChild(li);
          rem.textContent = String(Number(rem.textContent) - 1);
        }
        setTimeout(function () { pub.disabled = false; }, 300);
      });
      queue.addEventListener('click', function (e) {
        var a = e.target.closest ? e.target.closest('a') : null;
        if (!a) return;
        e.preventDefault();
        var id = a.getAttribute('data-upload-id');
        var at = added.findIndex(function (x) { return x.photo_id === id; });
        if (at >= 0) added.splice(at, 1); else deleted.push({ photo_id: id });
        a.parentNode.parentNode.removeChild(a.parentNode);
        rem.textContent = String(Number(rem.textContent) + 1);
      });
      document.getElementById('publisher').addEventListener('submit', function () {
        if (added.length) document.getElementById('photos_add').value = JSON.stringify(added);
        if (deleted.length) document.getElementById('photos_delete').value = JSON.stringify(deleted);
        pub.disabled = true;
      });
    </script>`,
  );
}

function entryPage(viewer, entryId) {
  const who = owner(entryId);
  if (!who) return null;
  if (members[who].protected && viewer !== who) {
    return page(viewer, `<p>This user's entries are protected. Sign up or Sign in</p>`);
  }
  const items = [
    {
      item_id_str: `main${entryId}`,
      thumbnail_url: thumb('main'),
      image_urls: { stdres: thumb('main'), original: null },
    },
    ...members[who].entries[entryId].extras.map((x) => ({
      item_id_str: x.id,
      thumbnail_url: thumb(x.id),
      image_urls: { stdres: thumb(x.id), original: null },
    })),
  ];
  return page(
    viewer,
    `<h1>${members[who].entries[entryId].title}</h1><script>blipfoto.data.gallery = ${JSON.stringify({ items })};</script>`,
  );
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  const cookie = /fake_session=([a-z]+)/.exec(req.headers.cookie ?? '')?.[1];
  const viewer = cookie && members[cookie] ? cookie : null;
  const send = (status, html, headers = {}) => {
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...headers });
    res.end(html);
  };
  const redirect = (to, headers = {}) => {
    res.writeHead(302, { location: to, ...headers });
    res.end();
  };
  console.log(`${req.method} ${url.pathname} as ${viewer ?? 'nobody'}`);

  if (url.pathname === '/test/login') {
    const as = url.searchParams.get('as') ?? '';
    if (!members[as]) return send(400, 'unknown member');
    return redirect('/browse', { 'set-cookie': `fake_session=${as}; Path=/; HttpOnly` });
  }
  if (url.pathname === '/test/reset') {
    members = seed();
    return send(200, 'ok');
  }
  if (url.pathname === '/test/state') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify(members));
  }
  if (url.pathname.startsWith('/img/')) {
    res.writeHead(200, { 'content-type': 'image/jpeg' });
    return res.end(
      Buffer.from(
        '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
        'base64',
      ),
    );
  }
  if (url.pathname === '/account/signin') {
    return viewer
      ? redirect('/browse')
      : send(
          200,
          page(
            null,
            '<form method="post"><input name="email"><input type="password" name="password"></form>',
          ),
        );
  }
  if (['/browse', '/settings/general'].includes(url.pathname)) {
    return viewer ? send(200, page(viewer, '<p>signed in</p>')) : redirect('/account/signin');
  }
  if (url.pathname === '/publish') {
    if (!viewer) return redirect('/account/signin');
    return send(
      200,
      page(
        viewer,
        `<input type="file" id="photo-uploader" multiple><span id="photo-uploader-remaining">${remaining(viewer)}</span><script>window.jQuery = { _data: function () { return { change: [1] }; } };</script>`,
      ),
    );
  }
  let m = /^\/entry\/(\d+)$/.exec(url.pathname);
  if (m) {
    const html = entryPage(viewer, m[1]);
    return html ? send(200, html) : send(404, page(viewer, 'not found'));
  }
  m = /^\/entry\/(\d+)\/edit$/.exec(url.pathname);
  if (m) {
    if (!viewer) return redirect('/account/signin');
    const entryId = m[1];
    if (owner(entryId) !== viewer) {
      // Another member's entry: the site shows that visitor their own journal, with no edit form.
      return send(200, page(viewer, '<h1>Your photo journal</h1>'));
    }
    if (req.method === 'POST') {
      const form = new URLSearchParams(await readBody(req));
      const entry = members[viewer].entries[entryId];
      for (const d of JSON.parse(form.get('photos_delete') || '[]')) {
        entry.extras = entry.extras.filter((x) => x.id !== d.photo_id);
      }
      for (const a of JSON.parse(form.get('photos_add') || '[]')) {
        counter += 1;
        entry.extras.push({ id: `a${counter}` });
      }
      return redirect(`/entry/${entryId}`);
    }
    return send(200, editPage(viewer, entryId));
  }
  return send(404, page(viewer, 'not found'));
}).listen(port, '127.0.0.1');
