// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A bisect for soft text on 100%-scale Windows monitors (b-oss#676). Two env switches, both inert when
// unset and honoured by a packaged exe too (they only change what is painted, never what the app does):
//   BMPC_TEST_PAGE=plain          load a tiny static page (text samples) instead of the app
//   BMPC_CSS_EXPERIMENT=a,b,...   inject CSS into the real app on did-finish-load; `report` only logs
// Pure functions only (no electron import) so they are unit-testable; index.ts applies them.

export const CSS_EXPERIMENTS = [
  'report', // no CSS: log which elements are layer-promoted or fractionally placed
  'no-layers', // drop will-change, backface, contain, filter, backdrop-filter; no transform on header parts
  'system-font', // Segoe UI everywhere
  'no-smoothing', // font-smoothing and text-rendering back to auto
  'no-overflow-scroll', // ion-content scroll container: no layer hints, no containment
  'no-ionic-transitions', // no CSS transitions or animations
  'no-title-centering', // title left-aligned: no centred (fractional) text offset
  'no-header-shadow', // drop Ionic's header/footer shadow pseudo-elements
  'all', // every CSS experiment above together
] as const;
export type CssExperiment = (typeof CSS_EXPERIMENTS)[number];

const CSS: Record<Exclude<CssExperiment, 'report' | 'all'>, string> = {
  'no-layers': `
*, *::before, *::after {
  will-change: auto !important;
  backface-visibility: visible !important;
  -webkit-backface-visibility: visible !important;
  filter: none !important;
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  contain: none !important;
  perspective: none !important;
  mix-blend-mode: normal !important;
}
ion-header, ion-footer, ion-toolbar, ion-title, ion-buttons, ion-button, ion-menu-button,
ion-tab-bar, ion-tab-button, ion-label, ion-item, ion-list {
  transform: none !important;
}`,
  'system-font': `
:root { --ion-font-family: "Segoe UI", sans-serif !important; }
*, *::before, *::after { font-family: "Segoe UI", sans-serif !important; }`,
  'no-smoothing': `
*, *::before, *::after {
  -webkit-font-smoothing: auto !important;
  text-rendering: auto !important;
  font-kerning: auto !important;
}`,
  'no-overflow-scroll': `
ion-content, ion-content::part(scroll), ion-content::part(background) {
  will-change: auto !important;
  contain: none !important;
  transform: none !important;
  -webkit-overflow-scrolling: auto !important;
  overscroll-behavior: auto !important;
}`,
  'no-ionic-transitions': `
*, *::before, *::after {
  transition: none !important;
  animation: none !important;
  --transition: none;
}`,
  'no-title-centering': `
ion-title {
  text-align: start !important;
  position: static !important;
  transform: none !important;
  padding-inline: 12px !important;
}`,
  'no-header-shadow': `
ion-header::after, ion-footer::before, ion-header.header-md::after, .header-md::after, .footer-md::before {
  display: none !important;
  background-image: none !important;
}
ion-header, ion-toolbar, ion-footer { box-shadow: none !important; }`,
};

/** The experiments asked for (`all` expands), unknown names reported. Order of CSS_EXPERIMENTS. */
export function parseCssExperiments(raw: string | undefined): {
  experiments: CssExperiment[];
  unknown: string[];
} {
  const wanted = new Set<string>();
  const unknown: string[] = [];
  for (const name of (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    if ((CSS_EXPERIMENTS as readonly string[]).includes(name)) wanted.add(name);
    else unknown.push(name);
  }
  if (wanted.has('all')) for (const e of CSS_EXPERIMENTS) wanted.add(e);
  return { experiments: CSS_EXPERIMENTS.filter((e) => wanted.has(e)), unknown };
}

/** The CSS for the experiments (empty for `report` alone). */
export function cssFor(experiments: readonly CssExperiment[]): string {
  return experiments
    .filter((e): e is Exclude<CssExperiment, 'report' | 'all'> => e !== 'report' && e !== 'all')
    .map((e) => `/* BMPC_CSS_EXPERIMENT ${e} */${CSS[e]}`)
    .join('\n');
}

/** BMPC_TEST_PAGE: only `plain` exists; anything else is ignored. */
export function parseTestPage(raw: string | undefined): 'plain' | null {
  return raw?.trim() === 'plain' ? 'plain' : null;
}

export const PLAIN_PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

const FAMILIES: Array<[string, string]> = [
  ['system sans-serif', 'sans-serif'],
  ['Segoe UI', "'Segoe UI', sans-serif"],
  [
    'Roboto-like fallback (Roboto, Helvetica Neue, Arial)',
    "Roboto, 'Helvetica Neue', Arial, sans-serif",
  ],
  ['monospace', 'monospace'],
];
const SIZES = [12, 14, 16, 20];
const SENTENCE = 'The quick brown fox jumps over the lazy dog 0123456789';

/** A static page of text samples: four families at four sizes, black on white and white on a solid
 * green band (like the app's header). No script, no layers, no transforms: plain text only. */
export function plainTestPage(): string {
  const rows = FAMILIES.map(([label, stack]) => {
    const lines = SIZES.map(
      (px) => `<div class="s" style="font:${px}px ${stack}">${px}px ${SENTENCE}</div>`,
    ).join('');
    return `<section><h2>${label}</h2>${lines}</section>`;
  }).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>b-mobile plain text test</title>
<style>
html,body{margin:0;background:#fff;color:#000}
body{padding:12px 16px}
h1{font:20px sans-serif;margin:0 0 8px}
h2{font:12px sans-serif;margin:12px 0 4px;color:#555}
.s{padding:2px 0}
.band{background:#2e7d32;color:#fff;padding:4px 16px;margin:12px -16px 0}
</style></head><body>
<h1>b-mobile plain text test (BMPC_TEST_PAGE=plain)</h1>
${rows}
<div class="band">${FAMILIES.map(([, stack]) => `<div class="s" style="font:16px ${stack}">16px ${SENTENCE} (on green)</div>`).join('')}</div>
</body></html>`;
}

/** Run in the page (by main, after load): what is layer-promoted or fractionally placed. Returns a
 * JSON string. Plain data only; reads computed styles and geometry, changes nothing. */
export const REPORT_SCRIPT = `(() => {
  const sels = ['ion-app','ion-header','ion-toolbar','ion-title','ion-buttons','ion-menu-button','ion-menu','ion-tab-bar','ion-tab-button','ion-content','ion-router-outlet','ion-split-pane','.ion-page'];
  const seen = new Set();
  const out = [];
  const frac = (n) => Math.abs(n - Math.round(n)) > 0.01;
  const info = (el, label) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const reasons = [];
    if (cs.transform !== 'none') reasons.push('transform=' + cs.transform);
    if (cs.willChange !== 'auto') reasons.push('will-change=' + cs.willChange);
    if (cs.filter !== 'none') reasons.push('filter');
    if (cs.backdropFilter && cs.backdropFilter !== 'none') reasons.push('backdrop-filter');
    if (cs.opacity !== '1') reasons.push('opacity=' + cs.opacity);
    if (cs.mixBlendMode !== 'normal') reasons.push('mix-blend-mode');
    if (cs.isolation === 'isolate') reasons.push('isolation');
    if (cs.contain !== 'none') reasons.push('contain=' + cs.contain);
    if (cs.position === 'fixed') reasons.push('position=fixed');
    if (cs.position === 'sticky') reasons.push('position=sticky');
    if (cs.perspective !== 'none') reasons.push('perspective');
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) reasons.push('scroller');
    const fr = [];
    for (const k of ['left','top','width','height']) if (frac(r[k])) fr.push(k + '=' + r[k].toFixed(2));
    return { el: label, layerReasons: reasons, fractional: fr, bg: cs.backgroundColor, font: cs.fontFamily.slice(0, 60), size: cs.fontSize, smoothing: cs.webkitFontSmoothing };
  };
  for (const s of sels) {
    document.querySelectorAll(s).forEach((el, i) => { if (i < 3 && !seen.has(el)) { seen.add(el); out.push(info(el, s + (i ? '#' + i : ''))); } });
  }
  return JSON.stringify({ dpr: devicePixelRatio, inner: [innerWidth, innerHeight], url: location.pathname, elements: out });
})()`;
