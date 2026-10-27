// The "Last 48 hours" outage graph: one lane per component, drawn only where something was wrong,
// each with a thin amber "Shared" lane beneath it, and a shared time axis. Widths are measured
// from the live layout so the 6 px minimum block width is real pixels.

import { h, hatch, ringFor, rove, s, setChildren, type MarkEl } from './dom';
import {
  HOUR,
  MINUTE,
  aboutDuration,
  componentName,
  dayLabel,
  incidentTitle,
  laneBlocks,
  laneTicks,
  sharedScale,
  timeOf,
} from './logic';
import { Readout, type Mark } from './readout';
import type { Component, StatusSnapshot } from './types';

const LANE_H = 36;
const SHARED_H = 18;
const COMPONENTS: Component[] = ['site', 'api'];

const quantised = (ms: number): number => Math.max(15, Math.round(ms / MINUTE / 15) * 15);

export function renderLanes(
  host: HTMLElement,
  snap: StatusSnapshot,
  now: number,
  mobile: boolean,
): void {
  const { from, to } = snap.last48h;
  const wrap = h('div', { class: 'st-lanes' });
  const rows: { c: Component; track: HTMLElement; shared: HTMLElement }[] = [];
  for (const c of COMPONENTS) {
    const track = h('div', { class: 'st-track' });
    const shared = h('div', { class: 'st-track st-track-shared' });
    wrap.append(
      h(
        'div',
        { class: 'st-lane-row' },
        h('div', { class: 'st-lane-label' }, componentName(c)),
        track,
      ),
      h(
        'div',
        { class: 'st-lane-row st-lane-row-shared' },
        h('div', { class: 'st-lane-label st-shared-label' }, 'Shared'),
        shared,
      ),
    );
    rows.push({ c, track, shared });
  }
  const axis = h(
    'div',
    { class: 'st-lane-row st-axis-row' },
    h('div', { class: 'st-lane-label' }),
    h('div', { class: 'st-track st-axis' }),
  );
  wrap.append(axis);
  const hint = 'Tap a mark, or use the buttons to step through them.';
  setChildren(host, wrap);
  const readout = new Readout(wrap, hint);

  const W = Math.floor(rows[0]?.track.getBoundingClientRect().width ?? 0);
  if (W <= 0) return;
  const marks: Mark[] = [];
  const ticks = laneTicks(from, to, W, mobile ? 12 : 6);
  const monitoredFrom = snap.monitoring_since;
  const unmonitoredW =
    monitoredFrom !== null && monitoredFrom > from
      ? Math.min(W, ((monitoredFrom - from) / (to - from)) * W)
      : 0;

  for (const { c, track, shared } of rows) {
    // ----- outage lane -----
    const svg = s('svg', {
      width: W,
      height: LANE_H,
      viewBox: `0 0 ${W} ${LANE_H}`,
      class: 'st-svg',
    });
    const hatchFill = hatch(svg);
    svg.append(
      s('rect', { x: 0.5, y: 0.5, width: W - 1, height: LANE_H - 1, rx: 4, class: 'st-lane-bg' }),
    );
    if (unmonitoredW > 0) {
      svg.append(
        s('rect', {
          x: 0.5,
          y: 0.5,
          width: unmonitoredW,
          height: LANE_H - 1,
          rx: 4,
          class: 'st-lane-before',
        }),
        s('line', {
          x1: unmonitoredW,
          x2: unmonitoredW,
          y1: 1,
          y2: LANE_H - 1,
          class: 'st-lane-edge',
        }),
      );
    }
    for (const t of ticks)
      if (t.day)
        svg.append(s('line', { x1: t.x, x2: t.x, y1: 1, y2: LANE_H - 1, class: 'st-daymark' }));
    const blocks = laneBlocks(snap.last48h[c], from, to, W);
    const group = s('g', {
      role: 'group',
      'aria-label': `${componentName(c)}, last 48 hours: ${blocks.length === 0 ? 'no marked periods' : `${blocks.length} marked period${blocks.length === 1 ? '' : 's'}`}`,
    });
    const laneMarks: MarkEl[] = [];
    for (const b of blocks) {
      const seg = b.segment;
      const mins = quantised((seg.end ?? now) - seg.start);
      const range = `${dayLabel(seg.start)}, ${timeOf(seg.start)} to ${seg.end === null ? 'now' : timeOf(seg.end)}`;
      const down = seg.kind === 'down';
      const title = down ? incidentTitle({ components: [c], failed: seg.failed ?? [] }) : 'No data';
      const lines = down
        ? [range, `${aboutDuration(mins)}${b.ongoing ? ' so far' : ''}`]
        : [range, 'We couldn’t check during this time.'];
      const note = down
        ? b.ongoing
          ? 'Still not working at our last check.'
          : seg.failed?.includes('photo')
            ? 'Photos not loading affects both the website and the API.'
            : undefined
        : 'A gap in our monitoring, not necessarily a problem with Blipfoto.';
      const rect = s('rect', {
        x: b.x,
        y: 4,
        width: b.w,
        height: LANE_H - 8,
        rx: 3,
        class: down ? 'st-block st-block-down' : 'st-block st-block-nodata',
        fill: down ? undefined : hatchFill,
        role: 'button',
        'aria-label': `${title}. ${lines.join('. ')}${note ? `. ${note}` : ''}`,
      });
      const ring = ringFor({ x: b.x, y: 4, w: b.w, h: LANE_H - 8 });
      group.append(rect, ring);
      laneMarks.push({ el: rect, ring });
      marks.push({ order: seg.start, el: rect, title, lines, note });
    }
    if (blocks.length === 0) {
      const msg = s(
        'text',
        { x: W / 2, y: LANE_H / 2 + 4, 'text-anchor': 'middle', class: 'st-lane-msg' },
        unmonitoredW > 0
          ? '✓ No problems since checking started'
          : '✓ No problems in the last 48 hours',
      );
      svg.append(msg);
    }
    svg.append(group);
    rove(laneMarks, (i) => {
      const el = laneMarks[i]?.el;
      if (el) readout.selectEl(el);
    });
    track.append(svg);

    // ----- shared lane -----
    const counts = snap.shares?.hours[c] ?? [];
    const scale = sharedScale(counts.map((x) => x[1]));
    const ssvg = s('svg', {
      width: W,
      height: SHARED_H,
      viewBox: `0 0 ${W} ${SHARED_H}`,
      class: 'st-svg',
    });
    ssvg.append(
      s('line', { x1: 0, x2: W, y1: SHARED_H - 0.5, y2: SHARED_H - 0.5, class: 'st-shared-base' }),
    );
    const sgroup = s('g', {
      role: 'group',
      'aria-label': `${componentName(c)}, shared problems, last 48 hours: ${counts.length === 0 ? 'none' : `${counts.length} hour${counts.length === 1 ? '' : 's'} with shares`}`,
    });
    const sharedMarks: MarkEl[] = [];
    const slot = W / 48;
    const bw = Math.max(3, slot * 0.6);
    for (const [hourStart, n] of counts) {
      if (hourStart + HOUR <= from || hourStart >= to) continue;
      const cx = ((hourStart + HOUR / 2 - from) / (to - from)) * W;
      const bh = Math.max(3, (n / scale) * (SHARED_H - 4));
      const bar = s('rect', {
        x: cx - bw / 2,
        y: SHARED_H - 1 - bh,
        width: bw,
        height: bh,
        class: 'st-shared-bar',
        role: 'button',
        'aria-label': `${n} shared for the ${componentName(c)}, ${timeOf(hourStart)} to ${timeOf(hourStart + HOUR)}. Not verified.`,
      });
      const ring = ringFor({ x: cx - bw / 2, y: SHARED_H - 1 - bh, w: bw, h: bh });
      sgroup.append(bar, ring);
      sharedMarks.push({ el: bar, ring });
      marks.push({
        order: hourStart,
        el: bar,
        title: `${n} shared for the ${componentName(c)}`,
        lines: [`${dayLabel(hourStart)}, ${timeOf(hourStart)} to ${timeOf(hourStart + HOUR)}`],
        note: 'Not verified',
      });
    }
    ssvg.append(sgroup);
    if (sharedMarks.length > 0)
      rove(sharedMarks, (i) => {
        const el = sharedMarks[i]?.el;
        if (el) readout.selectEl(el);
      });
    shared.append(ssvg);
  }

  // ----- shared time axis -----
  const axisEl = axis.querySelector('.st-axis');
  if (axisEl) {
    const asvg = s('svg', {
      width: W,
      height: 26,
      viewBox: `0 0 ${W} 26`,
      class: 'st-svg',
      'aria-hidden': 'true',
    });
    for (const t of ticks) {
      asvg.append(s('line', { x1: t.x, x2: t.x, y1: 0, y2: t.label ? 6 : 3, class: 'st-tick' }));
      if (t.label && t.x <= W - 34) {
        const anchor = t.x < 24 ? 'start' : t.x > W - 24 ? 'end' : 'middle';
        asvg.append(
          s(
            'text',
            {
              x: t.x,
              y: 19,
              'text-anchor': anchor,
              class: t.day ? 'st-axis-text st-axis-day' : 'st-axis-text',
            },
            t.label,
          ),
        );
      }
    }
    asvg.append(
      s('text', { x: W, y: 19, 'text-anchor': 'end', class: 'st-axis-text st-axis-day' }, 'Now'),
    );
    axisEl.append(asvg);
  }
  readout.setMarks(marks);
}
