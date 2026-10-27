// The "History" graphs: one panel per component, one column per UTC day for the last 30 days,
// column height = minutes down on an absolute scale with a 4-hour ceiling. Perfect days are empty.

import { h, hatch, ringFor, rove, s, setChildren, type MarkEl } from './dom';
import {
  HISTORY_CEILING_MIN,
  columnKeys,
  componentName,
  componentThe,
  durationLabel,
  failedChecksLabel,
  historyBars,
  sharedScale,
  utcDayLabel,
} from './logic';
import { Readout, type Mark } from './readout';
import type { Component, HistoryEntry, StatusSnapshot } from './types';

/** The History chart is a fixed 30 days; longer periods are in the uptime table and incident list. */
export const HISTORY_DAYS = 30;
const WORDS = 'the last 30 days';
const MAX_BAR_PX = 18;
const CHART_H = 80;
const TOP = 18;
const GAP_H = 8;
const GUTTER = 30;
const SHARED_H = 22;
const COMPONENTS: Component[] = ['site', 'api'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Axis labels for 30 columns: a date every 7 days back from today, and "Today" at the right edge. */
function axisLabels(keys: string[], plotW: number): { x: number; text: string; bold?: boolean }[] {
  const slot = plotW / keys.length;
  const out: { x: number; text: string; bold?: boolean }[] = [];
  for (let back = 28; back >= 7; back -= 7) {
    const i = keys.length - 1 - back;
    const k = keys[i];
    if (k === undefined || i < 0) continue;
    const m = MONTHS[Number(k.slice(5, 7)) - 1] ?? '';
    out.push({ x: (i + 0.5) * slot, text: `${Number(k.slice(8, 10))} ${m}` });
  }
  out.push({ x: plotW, text: 'Today', bold: true });
  return out;
}

function sharedMap(snap: StatusSnapshot, c: Component): Map<string, number> {
  return new Map(snap.shares?.days[c] ?? []);
}

export function renderHistory(host: HTMLElement, snap: StatusSnapshot, today: string): void {
  const wrap = h('div', { class: 'st-history' });
  const panels: { c: Component; chart: HTMLElement; shared: HTMLElement; summary: HTMLElement }[] =
    [];
  for (const c of COMPONENTS) {
    const summary = h('p', { class: 'st-summary' });
    const chart = h('div', { class: 'st-track st-hist-track' });
    const shared = h('div', { class: 'st-track st-track-shared' });
    wrap.append(
      h(
        'div',
        { class: 'st-hist-panel' },
        h(
          'div',
          { class: 'st-lane-row st-hist-head' },
          h('div', { class: 'st-lane-label' }),
          summary,
        ),
        h(
          'div',
          { class: 'st-lane-row' },
          h('div', { class: 'st-lane-label' }, componentName(c)),
          chart,
        ),
        h(
          'div',
          { class: 'st-lane-row st-lane-row-shared' },
          h('div', { class: 'st-lane-label st-shared-label' }, 'User reports'),
          shared,
        ),
      ),
    );
    panels.push({ c, chart, shared, summary });
  }
  setChildren(host, wrap);
  const readout = new Readout(wrap, 'Tap a bar, or use the buttons to step through.');
  const W = Math.floor(panels[0]?.chart.getBoundingClientRect().width ?? 0);
  if (W <= GUTTER + 20) return;
  const plotW = W - GUTTER;
  const marks: Mark[] = [];
  const first = snap.history.first_day;
  const keys = columnKeys(HISTORY_DAYS, today);
  const words = WORDS;

  for (const { c, chart, shared, summary } of panels) {
    const entries: HistoryEntry[] = snap.history.days[c];
    const sharesBy = sharedMap(snap, c);
    const bars = historyBars(keys, entries, plotW, CHART_H);
    const firstKey = keys.findIndex((k) => (first ? k >= first : false));
    const before = first ? (firstKey === -1 ? keys.length : firstKey) : keys.length;
    const monitoredDays = keys.length - before;

    // summary line
    // (The 30-day uptime figure is in the Uptime table; only a young deployment needs a note here.)
    summary.textContent =
      first && monitoredDays > 0 && monitoredDays < 7
        ? `Collecting data since ${utcDayLabel(first)}`
        : '';

    const H = TOP + CHART_H + GAP_H + 22;
    const svg = s('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'st-svg' });
    const base = TOP + CHART_H;
    const hatchFill = hatch(svg);
    if (before > 0 && first) {
      const bw = (before / keys.length) * plotW;
      svg.append(
        s('rect', { x: 0, y: TOP, width: bw, height: CHART_H, class: 'st-lane-before' }),
        s('line', { x1: bw, x2: bw, y1: TOP, y2: base, class: 'st-lane-edge' }),
      );
    }
    for (const frac of [1, 0.5]) {
      const y = base - CHART_H * frac;
      svg.append(
        s('line', { x1: 0, x2: plotW, y1: y, y2: y, class: 'st-grid' }),
        s(
          'text',
          { x: W - 2, y: y + 4, 'text-anchor': 'end', class: 'st-axis-text' },
          `${(HISTORY_CEILING_MIN * frac) / 60} h`,
        ),
      );
    }
    svg.append(
      s('line', { x1: 0, x2: plotW, y1: base + 0.5, y2: base + 0.5, class: 'st-baseline' }),
    );

    const group = s('g', {
      role: 'group',
      'aria-label': `${componentName(c)}, ${words}: ${bars.filter((b) => b.minutes > 0).length} columns with downtime`,
    });
    const barMarks: MarkEl[] = [];
    let lastLabelX = -Infinity;
    const slot = plotW / keys.length;
    const detail = (key: string): Pick<Mark, 'title' | 'lines' | 'note'> => {
      const lines = COMPONENTS.map((x) => {
        const e = snap.history.days[x].find((v) => v[0] === key);
        const n = sharedMap(snap, x).get(key) ?? 0;
        const down =
          e && e[1] > 0
            ? `${failedChecksLabel(e[1])}${e[2] ? `, ${e[2]} incident${e[2] === 1 ? '' : 's'}` : ''}`
            : 'no downtime';
        return `${componentName(x)}: ${down}${n > 0 ? `, ${n} user report${n === 1 ? '' : 's'}` : ''}`;
      });
      const e = entries.find((v) => v[0] === key);
      if (e && e[3] > 0) lines.push(`No data for ${durationLabel(e[3])}`);
      const mine = sharesBy.get(key) ?? 0;
      return {
        title: utcDayLabel(key),
        lines,
        note:
          mine > 0 && !(e && e[1] > 0)
            ? `Our checks found no downtime for ${componentThe(c)}.`
            : mine > 0
              ? 'User reports are not verified.'
              : undefined,
      };
    };

    for (const b of bars) {
      const e = b.entry;
      const hasNoData = !!e && e[3] > 0;
      if (b.h > 0) {
        const x = b.x - b.w / 2;
        const rect = s('rect', {
          x,
          y: base - b.h,
          width: b.w,
          height: b.h,
          class: 'st-bar',
          role: 'button',
          'aria-label': `${utcDayLabel(b.key)}: ${failedChecksLabel(b.minutes)}`,
        });
        group.append(rect);
        if (b.clipped) {
          const labelX = Math.min(Math.max(b.x, 24), plotW - 24);
          const cut = s('polygon', {
            points: `${x - 1},${base - b.h + 7} ${x + b.w + 1},${base - b.h + 3} ${x + b.w + 1},${base - b.h + 7} ${x - 1},${base - b.h + 11}`,
            class: 'st-bar-cut',
          });
          group.append(cut);
          // The true value above the bar, unless it would sit on the previous bar's label (the
          // pop-up still gives every value).
          if (labelX - lastLabelX >= 70) {
            lastLabelX = labelX;
            group.append(
              s(
                'text',
                { x: labelX, y: base - b.h - 4, 'text-anchor': 'middle', class: 'st-clip-label' },
                durationLabel(b.minutes),
              ),
            );
          }
        }
        const ring = ringFor({ x, y: base - b.h, w: b.w, h: b.h });
        group.append(ring);
        barMarks.push({ el: rect, ring });
        marks.push({ order: Date.parse(`${b.key}T00:00:00Z`), el: rect, ...detail(b.key) });
      }
      if (hasNoData) {
        svg.append(
          s('rect', {
            x: b.x - slot / 2,
            y: base + 3,
            width: Math.max(2, slot),
            height: GAP_H - 3,
            class: 'st-gap',
            fill: hatchFill,
          }),
        );
      }
    }
    svg.append(group);
    if (barMarks.length > 0)
      rove(barMarks, (i) => {
        const el = barMarks[i]?.el;
        if (el) readout.selectEl(el);
      });

    for (const l of axisLabels(keys, plotW)) {
      // A label too near the left edge is left-aligned there instead of being clipped.
      const anchor = l.x < 24 ? 'start' : l.x >= plotW - 1 ? 'end' : 'middle';
      svg.append(
        s(
          'text',
          {
            x: anchor === 'start' ? 0 : l.x,
            y: H - 4,
            'text-anchor': anchor,
            class: l.bold ? 'st-axis-text st-axis-day' : 'st-axis-text',
          },
          l.text,
        ),
      );
    }
    chart.append(svg);

    // shared lane for this panel
    const counts = keys.map((k) => sharesBy.get(k) ?? 0);
    const scale = sharedScale(counts);
    const ssvg = s('svg', {
      width: W,
      height: SHARED_H,
      viewBox: `0 0 ${W} ${SHARED_H}`,
      class: 'st-svg',
    });
    ssvg.append(
      s('line', {
        x1: 0,
        x2: plotW,
        y1: SHARED_H - 0.5,
        y2: SHARED_H - 0.5,
        class: 'st-shared-base',
      }),
    );
    const sgroup = s('g', {
      role: 'group',
      'aria-label': `${componentName(c)}, user reports, ${words}`,
    });
    const sharedMarks: MarkEl[] = [];
    keys.forEach((k, i) => {
      const n = counts[i] ?? 0;
      if (n <= 0) return;
      const bw = Math.min(MAX_BAR_PX, Math.max(2, slot * 0.7));
      const bh = Math.max(3, (n / scale) * (SHARED_H - 4));
      const x = (i + 0.5) * slot - bw / 2;
      const bar = s('rect', {
        x,
        y: SHARED_H - 1 - bh,
        width: bw,
        height: bh,
        class: 'st-shared-bar',
        role: 'button',
        'aria-label': `${utcDayLabel(k)}: ${n} user report${n === 1 ? '' : 's'} for ${componentThe(c)}. Not verified.`,
      });
      const ring = ringFor({ x, y: SHARED_H - 1 - bh, w: bw, h: bh });
      sgroup.append(bar, ring);
      sharedMarks.push({ el: bar, ring });
      marks.push({ order: Date.parse(`${k}T00:00:00Z`) + 1, el: bar, ...detail(k) });
    });
    ssvg.append(sgroup);
    if (sharedMarks.length > 0)
      rove(sharedMarks, (i) => {
        const el = sharedMarks[i]?.el;
        if (el) readout.selectEl(el);
      });
    shared.append(ssvg);
  }
  readout.setMarks(marks);
}
