// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { appMenuTemplate } from '../app-menu.js';

function flatten(items: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return items.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? flatten(item.submenu) : []),
  ]);
}

describe('appMenuTemplate', () => {
  for (const platform of ['win32', 'linux', 'darwin'] as const) {
    it(`${platform}: has no page-zoom items or accelerators`, () => {
      const all = flatten(appMenuTemplate(platform));
      const roles = all.map((i) => i.role);
      expect(roles).not.toContain('zoomIn');
      expect(roles).not.toContain('zoomOut');
      expect(roles).not.toContain('resetZoom');
      expect(all.some((i) => /zoom/i.test(i.accelerator?.toString() ?? ''))).toBe(false);
    });
  }

  it('keeps reload and developer tools shortcuts', () => {
    const roles = flatten(appMenuTemplate('win32')).map((i) => i.role);
    expect(roles).toContain('reload');
    expect(roles).toContain('toggleDevTools');
  });
});
