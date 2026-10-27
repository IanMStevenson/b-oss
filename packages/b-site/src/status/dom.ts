// Tiny DOM helpers: HTML and SVG element builders, and the roving-tabindex behaviour shared by
// every chart lane (one tab stop per lane, arrow keys move between marks).

type Attrs = Record<string, string | number | boolean | null | undefined>;
type Child = Node | string | null | undefined | false;

function apply(el: Element, attrs: Attrs): void {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    el.setAttribute(k, v === true ? '' : String(v));
  }
}

function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  apply(el, attrs);
  append(el, children);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function s<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  apply(el, attrs);
  append(el, children);
  return el;
}

let uid = 0;
export const nextId = (prefix: string): string => `${prefix}-${++uid}`;

/** Replace all children of `el`. */
export function setChildren(el: Element, ...children: Child[]): void {
  el.replaceChildren();
  append(el, children);
}

/** A focusable chart mark: the shape plus a focus-ring rect drawn only for keyboard focus. */
export interface MarkEl {
  el: SVGGraphicsElement;
  ring: SVGRectElement;
}

/** Make `marks` one roving-tabindex group: Tab enters at the active mark, arrows move, Home/End jump. */
export function rove(marks: MarkEl[], onActivate: (index: number) => void): void {
  marks.forEach((m, i) => {
    m.el.setAttribute('tabindex', i === 0 ? '0' : '-1');
    m.el.addEventListener('focus', () => {
      for (const o of marks) o.el.setAttribute('tabindex', o === m ? '0' : '-1');
      m.ring.style.display = m.el.matches(':focus-visible') ? 'block' : 'none';
    });
    m.el.addEventListener('blur', () => {
      m.ring.style.display = 'none';
    });
    m.el.addEventListener('keydown', (e) => {
      const ev = e;
      let to = -1;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') to = Math.min(marks.length - 1, i + 1);
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') to = Math.max(0, i - 1);
      else if (ev.key === 'Home') to = 0;
      else if (ev.key === 'End') to = marks.length - 1;
      if (to >= 0) {
        ev.preventDefault();
        marks[to]?.el.focus();
      } else if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        onActivate(i);
      }
    });
    m.el.addEventListener('click', () => onActivate(i));
  });
}

/** Position a focus ring around a mark's bounding box. */
export function ringFor(box: { x: number; y: number; w: number; h: number }): SVGRectElement {
  return s('rect', {
    class: 'st-ring',
    x: box.x - 3,
    y: box.y - 3,
    width: box.w + 6,
    height: box.h + 6,
    rx: 3,
    fill: 'none',
    style: 'display:none',
  });
}

/** Add a diagonal-stripe pattern to `svg` and return its `fill` reference. */
export function hatch(svg: SVGSVGElement): string {
  const id = nextId('hatch');
  svg.append(
    s(
      'defs',
      {},
      s(
        'pattern',
        { id, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' },
        s('rect', { width: 5, height: 5, fill: '#f3f4f6' }),
        s('line', { x1: 0, y1: 0, x2: 0, y2: 5, stroke: '#6b7280', 'stroke-width': 1.5 }),
      ),
    ),
  );
  return `url(#${id})`;
}
