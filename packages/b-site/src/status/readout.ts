// The details shown for a selected chart mark: a pop-up beside the mark on wide screens, a readout
// card with Earlier / Later steppers on phones. Both are fed from the same selection, so what a
// keyboard, a tap or a stepper chooses is always shown the same way.

import { h, setChildren } from './dom';

export interface Mark {
  /** Chronological order, for Earlier / Later. */
  order: number;
  el: SVGGraphicsElement;
  title: string;
  lines: string[];
  note?: string;
}

export class Readout {
  private marks: Mark[] = [];
  private current: Mark | null = null;
  private readonly pop: HTMLElement;
  private readonly card: HTMLElement;
  private readonly cardBody: HTMLElement;
  private readonly earlier: HTMLButtonElement;
  private readonly later: HTMLButtonElement;
  private readonly hint: HTMLElement;

  constructor(
    private readonly host: HTMLElement,
    hint: string,
  ) {
    this.pop = h('div', { class: 'st-pop', role: 'dialog', 'aria-label': 'Details', hidden: true });
    this.hint = h('p', { class: 'st-card-hint' }, hint);
    this.cardBody = h('div', { class: 'st-readout-body', 'aria-live': 'polite' });
    this.earlier = h('button', { type: 'button', class: 'st-step' }, '‹ Earlier');
    this.later = h('button', { type: 'button', class: 'st-step' }, 'Later ›');
    this.card = h(
      'div',
      { class: 'st-readout' },
      this.cardBody,
      h('div', { class: 'st-steppers' }, this.earlier, this.later),
    );
    this.earlier.addEventListener('click', () => this.step(-1));
    this.later.addEventListener('click', () => this.step(1));
    this.host.append(this.pop, this.card);
    this.host.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.current) {
        const back = this.current.el;
        this.select(null);
        back.focus();
      }
    });
    document.addEventListener('click', (e) => {
      if (this.current && !this.host.contains(e.target as Node)) this.select(null);
    });
    this.render();
  }

  setMarks(marks: Mark[]): void {
    this.marks = [...marks].sort((a, b) => a.order - b.order);
    this.select(null);
  }

  /** Select the mark whose element is `el`. */
  selectEl(el: Element): void {
    const m = this.marks.find((x) => x.el === el) ?? null;
    this.select(this.current === m ? null : m);
  }

  select(mark: Mark | null): void {
    for (const m of this.marks) m.el.classList.toggle('is-selected', m === mark);
    this.current = mark;
    this.render();
  }

  private step(by: number): void {
    if (this.marks.length === 0) return;
    const i = this.current ? this.marks.indexOf(this.current) : by > 0 ? -1 : this.marks.length;
    const next = this.marks[Math.min(this.marks.length - 1, Math.max(0, i + by))];
    if (next) this.select(next);
  }

  private render(): void {
    const m = this.current;
    const body = m
      ? [
          h('strong', {}, m.title),
          ...m.lines.map((l) => h('p', {}, l)),
          m.note ? h('p', { class: 'st-pop-note' }, m.note) : null,
        ]
      : [this.hint];
    setChildren(this.cardBody, ...body);
    const idx = m ? this.marks.indexOf(m) : -1;
    this.earlier.disabled = this.marks.length === 0 || (m !== null && idx <= 0);
    this.later.disabled = this.marks.length === 0 || (m !== null && idx >= this.marks.length - 1);
    if (!m) {
      this.pop.hidden = true;
      return;
    }
    const close = h(
      'button',
      { type: 'button', class: 'st-pop-close', 'aria-label': 'Close' },
      '×',
    );
    close.addEventListener('click', () => this.select(null));
    setChildren(
      this.pop,
      h('div', { class: 'st-pop-head' }, h('strong', {}, m.title), close),
      ...m.lines.map((l) => h('p', {}, l)),
      m.note ? h('p', { class: 'st-pop-note' }, m.note) : null,
    );
    this.pop.hidden = false;
    const host = this.host.getBoundingClientRect();
    const box = m.el.getBoundingClientRect();
    const w = Math.min(290, host.width);
    const left = Math.max(0, Math.min(box.left - host.left - 8, host.width - w));
    this.pop.style.left = `${left}px`;
    this.pop.style.top = `${box.bottom - host.top + 8}px`;
    this.pop.style.width = `${w}px`;
  }
}
