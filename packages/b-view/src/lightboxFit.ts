// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

export interface Size {
  width: number;
  height: number;
}

/** The largest size that keeps `natural`'s aspect ratio and fits entirely inside `box` ("contain").
 * Scales up as well as down, so a small image still fills the screen's limiting dimension. A
 * degenerate natural size or box yields 0×0 (the caller shows nothing until both are known). */
export function fitContain(natural: Size, box: Size): Size {
  if (natural.width <= 0 || natural.height <= 0 || box.width <= 0 || box.height <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(box.width / natural.width, box.height / natural.height);
  return { width: natural.width * scale, height: natural.height * scale };
}
