// The "History" graphs: one panel per component, one column per UTC day (weekly for All time),
// column height = minutes down on an absolute scale with a 4-hour ceiling. Perfect days are empty.

import { h, hatch, ringFor, rove, s, setChildren, type MarkEl } from './dom';
import {
  HISTORY_CEILING_MIN,
  columnKeys,
  componentName,
  durationLabel,
  historyBars,
  rangeSummary,
  sharedScale,
  utcDayLabel,
} from './logic';
import { Readout, type Mark } from './readout';
import type { Component, HistoryEntry, StatusSnapshot, UptimeKey } from './types';

export type Range = '30' | '90' | '365' | 'all';

export const RANGES: { id: Range; label: string; words: string }[] = [
  { id: '30', label: '30 days', words: 'the last 30 days' },
  { id: '90', label: '90 days', words: 'the last 90 days' },
  { id: '365', label: '1 year', words: 'the last year' },
  { id: 'all', label: 'All time', words: 'all time' },
];

const WINDOW: Record<Range, UptimeKey | null> = {
  '30': 'd30',
  '90': null,
  '365': 'd365',
  all: 'all',
};
const CHART_H = 80;
const TOP = 18;
const GAP_H = 8;
const GUTTER = 30;
const SHARED_H = 18;
const COMPONENTS: Component[] = ['site', 'api'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** x positions and text for the axis under a history chart. */
function axisLabels(
  keys: string[],
  range: Range,
  plotW: number,
): { x: number; text: string; bold?: boolean }[] {
  const slot = plotW / keys.length;
  const out: { x: number; text: string; bold?: boolean }[] = [];
  const first = keys[0];
  if (!first) return out;
  const step = range === '365' ? 3 : range === 'all' ? 6 : 1;
  const lastMonth = (k: string) => Number(k.slice(5, 7)) - 1;
  keys.forEach((k, i) => {
    const day = Number(k.slice(8, 10));
    const month = lastMonth(k);
    const monthStart = range === 'all' ? day <= 7 : day === 1;
    if (i > 0 && monthStart && month % step === 0 && (i + 0.5) * slot < plotW - 40) {
      out.push({
        x: (i + 0.5) * slot,
        text:
          range === 'all' || (range === '365' && month === 0)
            ? `${MONTHS[month]} ${k.slice(0, 4)}`
            : (MONTHS[month] ?? ''),
      });
    }
  });
  const m = MONTHS[Number(first.slice(5, 7)) - 1] ?? '';
  out.unshift({
    x: 0,
    text: range === 'all' ? `${m} ${first.slice(0, 4)}` : `${Number(first.slice(8, 10))} ${m}`,
  });
  out.push({ x: plotW, text: range === 'all' ? 'This week' : 'Today', bold: true });
  return out.filter(
    (l, i, a) => i === 0 || i === a.length - 1 || Math.abs(l.x - (a[i - 1]?.x ?? -99)) > 44,
  );
}

function sharedMap(snap: StatusSnapshot, c: Component, range: Range): Map<string, number> {
  const src = range === 'all' ? snap.shares?.weeks[c] : snap.shares?.days[c];
  return new Map(src ?? []);
}

export function renderHistory(
  host: HTMLElement,
  snap: StatusSnapshot,
  range: Range,
  today: string,
): void {
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
          h('div', { class: 'st-lane-label' }, componentName(c)),
          summary,
        ),
        h('div', { class: 'st-lane-row' }, h('div', { class: 'st-lane-label' }), chart),
        h(
          'div',
          { class: 'st-lane-row st-lane-row-shared' },
          h('div', { class: 'st-lane-label st-shared-label' }, 'Shared'),
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
  const keys = columnKeys(range === 'all' ? 'all' : Number(range), today, first);
  const words = RANGES.find((r) => r.id === range)?.words ?? '';
  const winKey = WINDOW[range];

  for (const { c, chart, shared, summary } of panels) {
    const entries: HistoryEntry[] = range === 'all' ? snap.history.weeks[c] : snap.history.days[c];
    const sharesBy = sharedMap(snap, c, range);
    const bars = historyBars(keys, entries, plotW, CHART_H);
    const firstKey = keys.findIndex((k) =>
      first ? (range === 'all' ? k >= weekOf(first) : k >= first) : false,
    );
    const before = first ? (firstKey === -1 ? keys.length : firstKey) : keys.length;
    const monitoredDays = keys.length - before;

    // summary line
    const cover = (range === 'all' ? monitoredDays * 7 : monitoredDays) * 1440;
    summary.textContent =
      first && monitoredDays > 0 && monitoredDays < 7 && range !== 'all'
        ? `Collecting data since ${utcDayLabel(first)}`
        : rangeSummary(words, entries, keys, winKey ? snap.uptime[c][winKey] : null, cover);

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
      const weekly = range === 'all';
      const lines = COMPONENTS.map((x) => {
        const e = (range === 'all' ? snap.history.weeks[x] : snap.history.days[x]).find(
          (v) => v[0] === key,
        );
        const n = sharedMap(snap, x, range).get(key) ?? 0;
        const down =
          e && e[1] > 0
            ? `${durationLabel(e[1])} down${e[2] ? `, ${e[2]} incident${e[2] === 1 ? '' : 's'}` : ''}`
            : 'no problems';
        return `${componentName(x)}: ${down}${n > 0 ? `, ${n} shared` : ''}`;
      });
      const e = entries.find((v) => v[0] === key);
      if (e && e[3] > 0) lines.push(`No data for ${durationLabel(e[3])}`);
      const mine = sharesBy.get(key) ?? 0;
      return {
        title: weekly ? `Week of ${utcDayLabel(key)}` : utcDayLabel(key),
        lines,
        note:
          mine > 0 && !(e && e[1] > 0)
            ? `Our checks found no problem with the ${componentName(c)}.`
            : mine > 0
              ? 'Shared problems are not verified.'
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
          'aria-label': `${utcDayLabel(b.key)}: ${durationLabel(b.minutes)} down`,
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

    for (const l of axisLabels(keys, range, plotW)) {
      const anchor = l.x <= 1 ? 'start' : l.x >= plotW - 1 ? 'end' : 'middle';
      svg.append(
        s(
          'text',
          {
            x: l.x,
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
      'aria-label': `${componentName(c)}, shared problems, ${words}`,
    });
    const sharedMarks: MarkEl[] = [];
    keys.forEach((k, i) => {
      const n = counts[i] ?? 0;
      if (n <= 0) return;
      const bw = Math.max(2, slot * 0.7);
      const bh = Math.max(3, (n / scale) * (SHARED_H - 4));
      const x = (i + 0.5) * slot - bw / 2;
      const bar = s('rect', {
        x,
        y: SHARED_H - 1 - bh,
        width: bw,
        height: bh,
        class: 'st-shared-bar',
        role: 'button',
        'aria-label': `${utcDayLabel(k)}: ${n} shared for the ${componentName(c)}. Not verified.`,
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

function weekOf(day: string): string {
  const ms = Date.parse(`${day}T00:00:00Z`);
  const dow = new Date(ms).getUTCDay();
  return new Date(ms - ((dow + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
}
