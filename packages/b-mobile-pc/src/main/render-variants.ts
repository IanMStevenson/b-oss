// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { App } from 'electron';

/** Rendering variants to try by hand when text looks soft on a scaled Windows display (b-oss#676).
 * Off unless the shell runs unpackaged (`npm run dev`, `electron .`); a packaged app ignores them.
 *   BMPC_RENDER_VARIANT=no-gpu,no-zoom-lock   comma-separated, any of VARIANTS below
 *   BMPC_CHROMIUM_FLAGS="--disable-lcd-text"  extra Chromium switches, space-separated */
export const VARIANTS = [
  'no-gpu', // app.disableHardwareAcceleration(): software compositing and raster
  'no-gpu-compositing', // --disable-gpu-compositing: GPU raster, software compositing
  'no-direct-composition', // --disable-direct-composition: Windows DirectComposition off
  'lcd-text', // --enable-lcd-text: sub-pixel text even in composited layers
  'no-lcd-text', // --disable-lcd-text: grayscale text everywhere
  'no-zoom-lock', // leave Chromium's page zoom and visual zoom limits alone (page-zoom-lock.ts)
] as const;
export type RenderVariant = (typeof VARIANTS)[number];

const SWITCHES: Partial<Record<RenderVariant, string>> = {
  'no-gpu-compositing': 'disable-gpu-compositing',
  'no-direct-composition': 'disable-direct-composition',
  'lcd-text': 'enable-lcd-text',
  'no-lcd-text': 'disable-lcd-text',
};

/** The variants asked for, or none when packaged. Unknown names are returned in `unknown`. */
export function parseRenderVariants(
  raw: string | undefined,
  packaged: boolean,
): { variants: Set<RenderVariant>; unknown: string[] } {
  const variants = new Set<RenderVariant>();
  const unknown: string[] = [];
  if (packaged || !raw) return { variants, unknown };
  for (const name of raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    if ((VARIANTS as readonly string[]).includes(name)) variants.add(name as RenderVariant);
    else unknown.push(name);
  }
  return { variants, unknown };
}

/** Switches for BMPC_CHROMIUM_FLAGS: `--name` or `--name=value`, without the leading dashes. */
export function parseChromiumFlags(
  raw: string | undefined,
  packaged: boolean,
): Array<[string, string | undefined]> {
  if (packaged || !raw) return [];
  return raw
    .split(/\s+/)
    .filter((f) => f.startsWith('--') && f.length > 2)
    .map((f) => {
      const eq = f.indexOf('=');
      return eq < 0 ? [f.slice(2), undefined] : [f.slice(2, eq), f.slice(eq + 1)];
    });
}

/** Applies the variants that are Chromium switches. Call before the app is ready. */
export function applyRenderVariants(
  app: App,
  env: NodeJS.ProcessEnv = process.env,
): Set<RenderVariant> {
  const { variants, unknown } = parseRenderVariants(env.BMPC_RENDER_VARIANT, app.isPackaged);
  const flags = parseChromiumFlags(env.BMPC_CHROMIUM_FLAGS, app.isPackaged);
  if (unknown.length) {
    console.warn(
      `BMPC_RENDER_VARIANT: unknown ${unknown.join(', ')}; known: ${VARIANTS.join(', ')}`,
    );
  }
  if (variants.has('no-gpu')) app.disableHardwareAcceleration();
  for (const v of variants) {
    const name = SWITCHES[v];
    if (name) app.commandLine.appendSwitch(name);
  }
  for (const [name, value] of flags) app.commandLine.appendSwitch(name, value);
  if (variants.size || flags.length) {
    const shown = flags.map(([n, v]) => (v ? `${n}=${v}` : n)).join(' ');
    console.log(`render variants: ${[...variants].join(',') || '-'}; flags: ${shown || '-'}`);
  }
  return variants;
}
