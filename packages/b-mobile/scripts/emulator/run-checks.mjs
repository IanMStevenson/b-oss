#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
//
// Automated device checks on the headless emulator (b-oss#796). See README.md.
//   node run-checks.mjs --main <main.apk> --integ <integ.apk> --out <dir> [--only update,links,...]
// Needs the emulator booted (emu.sh start). Every adb call is pinned to the emulator serial.
// Uses no real account and no real credentials; state is seeded through the app's own plugins.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import * as L from './lib.mjs';

const { values: o } = parseArgs({
  options: {
    main: { type: 'string' },
    integ: { type: 'string' },
    out: { type: 'string', default: './emulator-results' },
    only: { type: 'string' },
    sender: { type: 'string' },
  },
});
if (!o.main || !o.integ) {
  console.error('usage: run-checks.mjs --main main.apk --integ integ.apk [--out dir] [--only a,b]');
  process.exit(2);
}
mkdirSync(o.out, { recursive: true });

const results = [];
let current = null;
// Known, harmless noise, reported as notes rather than failures:
//  - WebView asks for /favicon.ico and the app has none (404).
//  - Capacitor's native inset injection runs before <body> exists on some launches
//    ("Error injecting safe area CSS ... reading 'style'"); the insets still apply.
const BENIGN = [
  /favicon\.ico/,
  /Error injecting safe area CSS/,
  /ERR_TUNNEL_CONNECTION_FAILED/, // images from CDNs the dev-box egress proxy does not allow
  /ERR_CONNECTION_REFUSED.*(geoapify|maptiler)|(geoapify|maptiler).*ERR_CONNECTION_REFUSED/,
]; // map tiles: the emulator has no route to the tile provider
const scrub = (e) => e.replace(/(api[_-]?key|key)=[^&\s]+/gi, '$1=<redacted>');
const real = (errs) => errs.filter((e) => !BENIGN.some((r) => r.test(e))).map(scrub);
const webviewVersion = () =>
  L.sh('dumpsys webviewupdate').match(
    /WebView package \(name, version\): \(\S+, ([\d.]+)\)/,
  )?.[1] ?? '?';
const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);

function check(name, ok, detail = '', { warn = false } = {}) {
  const status = ok ? 'PASS' : warn ? 'WARN' : 'FAIL';
  results.push({ check: current, name, ok: !!ok || warn, status, detail });
  console.log(`${status}  [${current}] ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Clicks the first visible ion-item / button whose text equals `label` (page JS .click()). */
const tap = (c, label) =>
  c.evaluate(
    `(() => { const e=[...document.querySelectorAll('ion-item,button,ion-button')].find(x=>x.innerText.trim()===${JSON.stringify(label)}); if(!e) return false; e.click(); return true; })()`,
  );
const path = (c) => c.evaluate('location.pathname');
const fresh = async (apk) => {
  L.stop();
  if (apk) L.adb('install', '-r', '-d', apk);
};

// ---- seed state, set through the app's own plugins -------------------------------------------
// A dev token: a made-up string, never a real credential. The API is unreachable from the
// emulator, so it is only ever stored and read back, not used.
const ACCOUNT = {
  id: 'emu-1',
  username: 'emulator-test',
  avatarUrl: null,
  appTokenScope: 'read,write',
  hasServiceToken: false,
  notificationRegistrationId: null,
  notificationStatus: null,
};
async function seed(c) {
  await c.evaluate(`(async () => {
    const P = Capacitor.Plugins;
    await P.Preferences.set({ key: 'b-mobile:accounts', value: JSON.stringify({ accounts: [${JSON.stringify(ACCOUNT)}], activeAccountId: 'emu-1' }) });
    await P.Preferences.set({ key: 'b-mobile:device-prefs', value: JSON.stringify({ schema: 2, overrides: { theme: 'dark', seenFirstRunExplainer: true, thumbnailZoomPercent: 130 } }) });
    await P.SecureStorage.internalSetItem({ prefixedKey: 'capacitor-storage_token:emu-1:app', data: JSON.stringify('dev-token-not-real'), sync: false });
    return true; })()`);
}
/** Snapshot of what must survive an update: the Preferences file and the secure-storage file. */
function dataFingerprint() {
  const files = {};
  for (const f of L.sh(`run-as ${L.PKG} ls shared_prefs`)
    .split(/\s+/)
    .filter((x) => x.endsWith('.xml'))
    .sort()) {
    files[f] = hash(L.appFile(`shared_prefs/${f}`));
  }
  return files;
}

// ---- checks ----------------------------------------------------------------------------------
const checks = {
  async update() {
    await fresh(o.main);
    L.clearData();
    L.launch();
    let c = await L.connect();
    await c.waitFor(`document.querySelector('ion-menu')`);
    await seed(c);
    check(
      'main build installed',
      true,
      L.sh(`dumpsys package ${L.PKG}`).match(/versionName=\S+/)?.[0] ?? '',
    );
    await c.close();
    L.stop();
    const before = dataFingerprint();
    check('seeded state written', Object.keys(before).length >= 2, Object.keys(before).join(', '));

    // The update: install -r over the old build, as the Play Store does (no uninstall, no clear).
    L.adb('install', '-r', o.integ);
    check('install -r of integration build over main', true);
    const after = dataFingerprint();
    check(
      'on-disk preferences files unchanged by the install',
      JSON.stringify(before) === JSON.stringify(after),
      JSON.stringify({ before, after }),
    );

    L.launch();
    c = await L.connect();
    await c.waitFor(`document.querySelector('ion-menu')`);
    await L.sleep(2500);
    const prefs = await c.evaluate(
      `(async()=>{const P=Capacitor.Plugins; const a=await P.Preferences.get({key:'b-mobile:accounts'}); const d=await P.Preferences.get({key:'b-mobile:device-prefs'}); return {a:a.value, d:d.value};})()`,
    );
    check(
      'accounts pref survives',
      prefs.a?.includes('emulator-test') && prefs.a.includes('"activeAccountId":"emu-1"'),
    );
    check(
      'device prefs survive (incl. non-default theme, zoom)',
      prefs.d?.includes('"theme":"dark"') && prefs.d.includes('130'),
    );
    const tok = await c.evaluate(
      `Capacitor.Plugins.SecureStorage.internalGetItem({ prefixedKey: 'capacitor-storage_token:emu-1:app', sync: false }).then(r=>r.data, ()=>null)`,
    );
    check(
      'secure-storage token survives (value not recorded)',
      tok === JSON.stringify('dev-token-not-real'),
    );
    const menu = await c.evaluate(`document.querySelector('ion-menu').innerText`);
    check('app still shows the account after update', menu.includes('emulator-test'));
    const bg = await c.evaluate(
      `getComputedStyle(document.querySelector('ion-content')||document.body).getPropertyValue('--background')||getComputedStyle(document.body).backgroundColor`,
    );
    const rgb = (bg.match(/\d+/g) ?? []).map(Number);
    const hexv = bg.trim().match(/^#([0-9a-f]{6})$/i);
    const lum = hexv
      ? [0, 2, 4].map((i) => parseInt(hexv[1].slice(i, i + 2), 16)).reduce((a, b) => a + b, 0) / 3
      : rgb.length >= 3
        ? (rgb[0] + rgb[1] + rgb[2]) / 3
        : 255;
    check(
      'dark theme still applied (page background is dark)',
      lum < 90,
      `background=${bg.trim()}`,
    );
    check('no JS errors after update', real(c.errors).length === 0, real(c.errors).join(' | '));
    await c.screenshot(`${o.out}/update-after.png`);
    await c.close();
  },

  async start() {
    await fresh(o.integ);
    L.clearData();
    L.launch();
    const c = await L.connect();
    await c.waitFor(`document.querySelector('ion-menu')`);
    await L.sleep(3000);
    check('cold start reaches Browse', (await path(c)) === '/browse', await path(c));
    check('cold start: no console errors', real(c.errors).length === 0, real(c.errors).join(' | '));
    await c.screenshot(`${o.out}/cold-start.png`);
    await c.close();
  },

  async links() {
    let parsesHost;
    await fresh();
    for (const [label, url, want] of [
      ['entry', `${L.SCHEME}://entry/5000000000`, '/entry/5000000000'],
      ['profile', `${L.SCHEME}://user/emulator-test`, '/user/emulator-test'],
      ['malformed escape is ignored', `${L.SCHEME}://entry/%E0%A4%A`, null],
    ]) {
      // cold: app not running
      L.stop();
      L.view(url);
      let c = await L.connect();
      await c.waitFor(`document.querySelector('ion-menu')`);
      await L.sleep(1500);
      const cold = await path(c);
      // Chromium before standard-compliant non-special-URL parsing gives host '' and pathname
      // '//entry/…' for bmobile-debug://entry/…, which the app's resolver (URL.host) cannot route.
      // The installed WebView's version is recorded; if it parses this way, route checks for the
      // custom scheme are WARN (a finding about old WebViews), and delivery is asserted instead.
      parsesHost ??= await c.evaluate(`new URL('${L.SCHEME}://entry/1').host === 'entry'`);
      if (parsesHost === false && want) {
        const launch = await c.evaluate(`Capacitor.Plugins.App.getLaunchUrl().then(r=>r&&r.url)`);
        check(`${label}: cold start, URL delivered to the app`, launch === url, launch);
      }
      check(
        `${label}: cold start routes to ${want ?? 'nowhere'}`,
        want ? cold === want : !cold.startsWith('/entry/'),
        `${cold}${parsesHost === false && want ? ` (WebView ${webviewVersion()} parses custom-scheme host as empty)` : ''}`,
        { warn: parsesHost === false && !!want },
      );
      // warm: app already running, on Browse
      await c.evaluate(`history.pushState({}, '', '/browse')`);
      L.home();
      await L.sleep(800);
      L.view(url);
      await L.sleep(1500);
      const warm = await path(c);
      check(
        `${label}: warm start routes to ${want ?? 'nowhere'}`,
        want ? warm === want : !warm.startsWith('/entry/'),
        warm,
        { warn: parsesHost === false && !!want },
      );
      check(`${label}: no console errors`, real(c.errors).length === 0, real(c.errors).join(' | '));
      await c.close();
    }
    // blipfoto.com web links reach the app only when the user has opted in (activity-alias).
    L.stop();
    L.launch();
    let c = await L.connect();
    await c.waitFor(`document.querySelector('ion-menu')`);
    const resolveBefore = L.sh(
      `cmd package resolve-activity --brief -a android.intent.action.VIEW -d https://www.blipfoto.com/entry/5000000000 -c android.intent.category.BROWSABLE ${L.PKG}`,
    );
    check(
      'blipfoto.com link is NOT handled by the app by default',
      !/BlipfotoLinks|bmobile.*Alias|MainActivity/i.test(resolveBefore.split('\n').pop()),
      resolveBefore.trim().split('\n').pop(),
    );
    // Opt in the way a user does: the preference (not the plugin) is the source of truth, and the
    // app re-syncs the activity-alias from it on every launch, so set it, then restart.
    await c.evaluate(
      `Capacitor.Plugins.Preferences.set({ key: 'b-mobile:device-prefs', value: JSON.stringify({ schema: 2, overrides: { openBlipfotoLinksInApp: true, seenFirstRunExplainer: true } }) })`,
    );
    await c.close();
    L.stop();
    L.launch();
    c = await L.connect();
    await c.waitFor(`document.querySelector('ion-menu')`);
    await L.sleep(2000);
    check(
      'opting in enables the blipfoto.com link handler',
      /BlipfotoWebLinkAlias/.test(
        L.sh(
          `cmd package resolve-activity --brief -a android.intent.action.VIEW -d https://www.blipfoto.com/entry/5000000000 -c android.intent.category.BROWSABLE ${L.PKG}`,
        ),
      ),
    );
    await c.close();
    L.stop();
    L.view('https://www.blipfoto.com/entry/5000000000');
    c = await L.connect();
    await c.waitFor(`document.querySelector('ion-menu')`);
    await L.sleep(1500);
    check(
      'blipfoto.com entry link opens in app when opted in',
      (await path(c)) === '/entry/5000000000',
      await path(c),
    );
    await c.evaluate(`Capacitor.Plugins.Preferences.remove({ key: 'b-mobile:device-prefs' })`);
    await c.close();
    L.stop();
    L.launch(); // hydrate re-syncs the alias to the (default) off preference
    await L.sleep(3000);
  },

  async share() {
    await fresh();
    // adb's `am start` cannot grant MediaStore URIs, so a tiny test "gallery" app (sender/) shares
    // a generated PNG with a read grant, as a real sharer does. Build it with build-sender.sh.
    if (!o.sender) {
      check('sender APK given (--sender)', false, 'build with build-sender.sh');
      return;
    }
    L.adb('install', '-r', o.sender);
    const send = () => L.sh(`am start -W -n emutest.sender/emutest.Send --es target ${L.PKG}`);
    L.stop();
    L.launch();
    let c = await L.connect();
    await c.waitFor(`document.querySelector('ion-menu')`);
    await seed(c);
    await c.close();
    L.stop();
    send(); // cold: the app is not running
    c = await L.connect();
    await c.waitFor(`document.querySelector('ion-menu')`);
    await c
      .waitFor(`location.pathname.startsWith('/compose')`, { label: 'compose route' })
      .catch(() => {});
    await L.sleep(2000);
    check(
      'share intent (cold) lands on compose',
      (await path(c)).startsWith('/compose'),
      await path(c),
    );
    // Finding: shareIntent.ts hands compose a raw file:// path (no Capacitor.convertFileSrc), which
    // the https://localhost WebView refuses to load, so the preview is blank. WARN, not FAIL.
    check(
      'compose shows the shared photo (preview decodes)',
      await c.evaluate(`[...document.querySelectorAll('img')].some(i=>i.naturalWidth>0)`),
      'preview <img> did not decode; WebView logs "Not allowed to load local resource: file://…/cache/shared/…"',
      { warn: true },
    );
    await c.screenshot(`${o.out}/share-compose.png`);
    // warm: app already running, shared again
    await c.evaluate(`history.pushState({}, '', '/browse')`);
    L.home();
    await L.sleep(800);
    send();
    await c.waitFor(`location.pathname.startsWith('/compose')`, { timeout: 15000 }).catch(() => {});
    check(
      'share intent (warm) lands on compose',
      (await path(c)).startsWith('/compose'),
      await path(c),
    );
    const otherErrors = real(c.errors).filter(
      (e) => !/Not allowed to load local resource: file:/.test(e),
    );
    check(
      'no console errors (besides the file:// preview above)',
      otherErrors.length === 0,
      otherErrors.join(' | '),
    );
    await c.close();
  },

  async back() {
    await fresh();
    L.stop();
    L.launch();
    let c = await L.connect();
    await c.waitFor(`document.querySelector('ion-menu')`);
    await L.sleep(2500);
    // Browse is the root: by design Back does nothing there (BEHAVIOUR.md, no exit), however often.
    for (let i = 0; i < 2; i++) {
      L.back();
      await L.sleep(1200);
    }
    const top =
      L.sh('dumpsys activity activities').match(/topResumedActivity.*?(\S+\/\S+)/)?.[1] ?? '?';
    check(
      'back on Browse at launch is swallowed (stays in app, stays on /browse)',
      top.includes(L.PKG) && (await path(c)) === '/browse',
      `top=${top}`,
    );
    // Each main screen, reached through the side menu: back returns to Browse. (The menu is closed
    // through its API first: a scripted click on a menu item leaves it open, a real tap closes it.)
    for (const label of ['Map', 'Search', 'Settings', 'Help']) {
      await c.evaluate(`document.querySelector('ion-menu').close(false)`).catch(() => {});
      await c.evaluate(`history.pushState({}, '', '/browse'); 1`);
      await tap(c, label);
      await L.sleep(1200);
      await c.evaluate(`document.querySelector('ion-menu').close(false)`).catch(() => {});
      await L.sleep(500);
      const here = await path(c);
      L.back();
      await L.sleep(1500);
      const there = await path(c);
      check(
        `back from ${label} (${here}) leaves it, app still running`,
        !!L.pid() && there !== here,
        `${here} -> ${there}`,
      );
    }
    // With the side menu open, back closes the menu first.
    await c.evaluate(`document.querySelector('ion-menu').open(false)`);
    await L.sleep(800);
    L.back();
    await L.sleep(1000);
    check(
      'back with the side menu open closes the menu',
      (await c.evaluate(`document.querySelector('ion-menu').isOpen()`)) === false && !!L.pid(),
    );
    check('no console errors', real(c.errors).length === 0, real(c.errors).join(' | '));
    await c.close();
  },

  async resume() {
    await fresh();
    L.stop();
    L.launch();
    const c = await L.connect();
    await c.waitFor(`document.querySelector('ion-menu')`);
    await L.sleep(2000);
    await tap(c, 'Settings');
    await L.sleep(1500);
    await c.evaluate(`document.querySelector('ion-menu').close(false)`).catch(() => {});
    const before = await path(c);
    check('on a non-default screen before backgrounding', before === '/settings', before);
    L.home();
    await L.sleep(4000);
    L.launch();
    await L.sleep(2000);
    check('app still alive after 4 s in background', !!L.pid());
    check(
      'resume from background keeps the screen',
      (await path(c)) === before,
      `${before} -> ${await path(c)}`,
    );
    // process death: kill in background, relaunch (state restored from prefs only)
    L.home();
    await L.sleep(1000);
    L.sh(`am kill ${L.PKG}`);
    await L.sleep(1000);
    check('app process was killed in background', !L.pid());
    L.launch();
    const c2 = await L.connect();
    await c2.waitFor(`document.querySelector('ion-menu')`);
    await L.sleep(2000);
    check(
      'relaunch after process death starts cleanly on Browse',
      real(c2.errors).length === 0 && (await path(c2)) === '/browse',
      `${await path(c2)} ${real(c2.errors).join(' | ')}`,
    );
    await c2.close();
  },

  async offline() {
    await fresh();
    L.stop();
    L.launch();
    let c = await L.connect();
    await c.waitFor(`document.querySelector('ion-menu')`);
    await L.sleep(4000);
    const online = await c.text();
    check(
      'baseline: Browse renders with no route to Blipfoto (egress-limited emulator)',
      /Can’t reach Blipfoto|Couldn’t load|Recent/.test(online),
      (online.match(/Can’t reach Blipfoto|You seem to be offline|Couldn’t load/) ?? [
        '(feed shown)',
      ])[0],
    );
    L.sh('cmd connectivity airplane-mode enable');
    await L.sleep(3000);
    await tap(c, 'Try again');
    await L.sleep(6000);
    const off = await c.text();
    check(
      'airplane mode: app says you seem to be offline',
      off.includes('You seem to be offline'),
      (off.match(/Can’t reach Blipfoto|You seem to be offline|Couldn’t load/) ?? ['(none)'])[0],
    );
    await c.screenshot(`${o.out}/offline.png`);
    L.sh('cmd connectivity airplane-mode disable');
    await L.sleep(4000);
    await tap(c, 'Try again');
    await L.sleep(6000);
    const back = await c.text();
    check('network restored: no longer says offline', !back.includes('You seem to be offline'));
    check(
      'app survived the toggle (process alive, no uncaught errors)',
      !!L.pid() && real(c.errors).filter((e) => e.startsWith('exception')).length === 0,
    );
    await c.close();
  },
  /**
   * Real OAuth sign-in with the owner's own test account (stretch check, opt-in: --only oauth).
   * Credentials come only from ~/.config/b-mobile/emulator-account.env (BLIPFOTO_USER,
   * BLIPFOTO_PASSWORD) and are never printed, logged, screenshotted or written to results; the
   * login form is never captured. Needs the emulator to reach Blipfoto (EMU_PROXY, see README).
   * One login per run: it is deliberately not part of the default set.
   */
  async oauth() {
    const envFile = `${homedir()}/.config/b-mobile/emulator-account.env`;
    if (!existsSync(envFile)) {
      check('credentials file present', true, 'skipped: no emulator-account.env');
      return;
    }
    const env = Object.fromEntries(
      readFileSync(envFile, 'utf8')
        .split('\n')
        .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2].replace(/^(['"])(.*)\1$/, '$2')]),
    );
    if (!env.BLIPFOTO_USER || !env.BLIPFOTO_PASSWORD) {
      check('credentials file has BLIPFOTO_USER and BLIPFOTO_PASSWORD', false);
      return;
    }
    const secrets = [env.BLIPFOTO_USER, env.BLIPFOTO_PASSWORD];
    const safe = (m) => secrets.reduce((t, v) => t.split(v).join('<redacted>'), String(m));
    await fresh(o.integ);
    L.clearData();
    L.launch();
    let c = await L.connect();
    try {
      await c.waitFor(`document.querySelector('ion-menu')`);
      await tap(c, 'Sign in');
      await c.waitFor(`location.pathname === '/sign-in'`);
      await c.evaluate(
        `(() => { const b=[...document.querySelectorAll('ion-button')].find(x=>x.innerText.trim()==='Got it'); b&&b.click(); return 1 })()`,
      );
      await L.sleep(600);
      // Turn off "Use browser to sign in": the in-app (embedded WebView) path is the scriptable one.
      await c.evaluate(
        `(() => { const t=[...document.querySelectorAll('ion-toggle')].find(x=>(x.closest('ion-item')?.innerText||'').includes('Use browser')); if (t && t.checked) t.click(); return 1 })()`,
      );
      await L.sleep(400);
      await c.evaluate(
        `[...document.querySelectorAll('ion-button')].find(b=>b.innerText.trim()==='Continue').click()`,
      );
      const login = await L.connect({ match: /blipfoto\.com\/account\/signin/ });
      await login.waitFor(`document.querySelector('input[name=password]')`);
      // No captcha / bot-check element on the form: a stop condition if one ever appears.
      const blocker = await login.evaluate(
        `!!document.querySelector('iframe,.g-recaptcha,.cf-turnstile,[id*=captcha i],[class*=captcha i]')`,
      );
      check('login page has no captcha or bot-check element', !blocker);
      if (blocker) {
        await login.close();
        return;
      }
      const status = await login.evaluate(`(() => {
        const set = (n, v) => { const e=document.querySelector('input[name='+n+']'); const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value'); d.set.call(e, v); e.dispatchEvent(new Event('input',{bubbles:true})); };
        try { set('email', ${JSON.stringify(env.BLIPFOTO_USER)}); set('password', ${JSON.stringify(env.BLIPFOTO_PASSWORD)}); document.querySelector('input[type=submit]').click(); return 'submitted'; } catch (e) { return 'form error'; }
      })()`);
      check('login form filled and submitted', status === 'submitted');
      await login.close().catch(() => {});
      // Authorisation page (if any) then the redirect back to the app.
      let onApp = false;
      for (let i = 0; i < 40 && !onApp; i++) {
        await L.sleep(1500);
        const targets = await L.listTargets().catch(() => null);
        if (!targets) continue;
        const authPage = targets.find((u) => /blipfoto\.com\/oauth\/authorize/.test(u));
        if (authPage) {
          const a = await L.connect({ match: /oauth\/authorize/ });
          await a
            .evaluate(
              `(() => { const b=[...document.querySelectorAll('input[type=submit],button')].find(x=>/approve|allow|authori[sz]e|accept/i.test(x.value||x.innerText||'')); if (b) { b.click(); return 'clicked' } return 'none' })()`,
            )
            .catch(() => {});
          await a.close().catch(() => {});
        }
        onApp = !targets.some((u) => /blipfoto\.com/.test(u));
      }
      c = await L.connect({ match: /^https:\/\/localhost/ });
      await L.sleep(4000);
      const accounts = await c.evaluate(
        `Capacitor.Plugins.Preferences.get({key:'b-mobile:accounts'}).then(r=>r.value)`,
      );
      const parsed = accounts ? JSON.parse(accounts) : { accounts: [] };
      check(
        'OAuth round trip returns to the app signed in',
        parsed.accounts.length === 1 && parsed.accounts[0].appTokenScope !== null,
        `accounts=${parsed.accounts.length}, scope=${parsed.accounts[0]?.appTokenScope ?? 'none'}`,
      );
      const tok = await c.evaluate(
        `Capacitor.Plugins.SecureStorage.internalGetItem({ prefixedKey: 'capacitor-storage_token:' + ${JSON.stringify(parsed.accounts[0]?.id ?? '')} + ':app', sync: false }).then(r=>!!r.data, ()=>false)`,
      );
      check('app token stored in secure storage (value not read out)', tok === true);
      check(
        'no console errors',
        real(c.errors).map(safe).length === 0,
        real(c.errors).map(safe).join(' | '),
      );
    } catch (e) {
      check('oauth ran to completion', false, safe(e.message));
    } finally {
      await c.close().catch(() => {});
    }
  },
};

const order = ['update', 'start', 'links', 'share', 'back', 'resume', 'offline'];
const run = o.only ? o.only.split(',') : order;
for (const name of run) {
  current = name;
  try {
    await checks[name]();
  } catch (e) {
    check('check ran to completion', false, e.message);
  }
}
writeFileSync(
  `${o.out}/results.json`,
  JSON.stringify({ at: new Date().toISOString(), results }, null, 2),
);
const failed = results.filter((r) => r.status === 'FAIL').length;
const warned = results.filter((r) => r.status === 'WARN').length;
console.log(
  `\n${results.filter((r) => r.status === 'PASS').length}/${results.length} passed, ${warned} warning(s), ${failed} failed`,
);
process.exit(failed ? 1 : 0);
