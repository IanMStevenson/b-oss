// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Draggable chip content script (vanilla TS, shadow DOM, no React).
// Injects a floating b-ark status chip onto any host page.
// Design spec: "Pulse" — debug/design_handoff_status_chip/README.md

type RagState = 'green' | 'amber' | 'red';
type ErrorKind = 'permission' | 'auth' | 'error' | null;
type AmberReason = 'rate' | null;

type VisualState =
  | 'rate_limited'
  | 'backing_up'
  | 'perm_error'
  | 'auth_error'
  | 'gen_error'
  | 'backed_up'
  | 'never_backed_up'
  | 'incomplete';

interface ChipStorage {
  chip_rag?: RagState;
  chip_progress?: { done: number; total: number } | null;
  chip_last_backup_at?: string | null;
  chip_error_kind?: ErrorKind;
  chip_amber_reason?: AmberReason;
  chip_avatar_url?: string | null;
  chip_show_avatar?: boolean;
  chip_position?: { xPct: number; yPct: number };
  chip_enabled?: boolean;
}

const STORAGE_KEYS: (keyof ChipStorage)[] = [
  'chip_rag',
  'chip_progress',
  'chip_last_backup_at',
  'chip_error_kind',
  'chip_amber_reason',
  'chip_avatar_url',
  'chip_show_avatar',
  'chip_position',
  'chip_enabled',
];

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
  :host {
    all: initial;
    display: block;
    position: fixed;
    z-index: 2147483647;
    pointer-events: none;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }

  .outer {
    position: relative;
    display: inline-block;
    pointer-events: auto;
    cursor: grab;
    user-select: none;
    touch-action: none;
  }

  .outer.dragging { cursor: grabbing; }

  /* ── Pill wrapper ───────────────────────────────────────────────── */
  .pill-wrap {
    display: inline-flex;
    align-items: center;
    border-radius: 999px;
  }

  .pill-wrap.pill-mode {
    background: #fff;
    padding: 4px 15px 4px 5px;
    gap: 10px;
    box-shadow: 0 10px 26px rgba(0,0,0,.22), 0 0 0 1px rgba(0,0,0,.05);
  }

  /* ── Avatar wrap ────────────────────────────────────────────────── */
  .avatar-wrap {
    position: relative;
    flex-shrink: 0;
    border-radius: 50%;
  }

  .avatar-wrap.sz-34 { width: 34px; height: 34px; }
  .avatar-wrap.sz-28 { width: 28px; height: 28px; }

  .avatar {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: radial-gradient(120% 120% at 30% 24%, #2E6E52, #14382A);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.12);
  }

  .avatar-letter {
    color: #EAF4EE;
    font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-weight: 700;
    letter-spacing: -0.01em;
    line-height: 1;
  }

  .avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }

  /* ── RAG dot ────────────────────────────────────────────────────── */
  .rag-dot {
    position: absolute;
    bottom: -1px;
    right: -1px;
    border-radius: 50%;
    box-shadow: 0 0 0 2.5px #fff;
  }

  .rag-dot.sz-34 { width: 12px; height: 12px; }
  .rag-dot.sz-28 { width: 10px; height: 10px; }

  .rag-dot.col-grey   { background: #9AA0A6; }
  .rag-dot.col-amber  { background: #E0A020; }
  .rag-dot.col-green  { background: #1FA85A; }
  .rag-dot.col-red    { background: #D6453F; }

  .rag-dot.pulse { animation: barkPulse 1.6s ease-in-out infinite; }

  /* ── Pill content ───────────────────────────────────────────────── */
  .pill-content {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .progress-count {
    font-size: 13px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .progress-done  { color: #E0A020; }
  .progress-total { color: #9AA0A6; }

  .progress-bar-wrap {
    width: 66px;
    height: 5px;
    border-radius: 9px;
    background: rgba(0,0,0,.10);
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    border-radius: 9px;
    background: #E0A020;
    transition: width 0.3s ease;
  }

  .progress-bar-fill.shimmer {
    background-image: linear-gradient(
      135deg,
      rgba(255,255,255,.30) 25%,
      transparent 25% 50%,
      rgba(255,255,255,.30) 50% 75%,
      transparent 75%
    );
    background-size: 16px 16px;
    animation: barkShimmer 0.9s linear infinite;
  }

  .pill-btn {
    padding: 5px 12px;
    border-radius: 999px;
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: .01em;
    white-space: nowrap;
    cursor: pointer;
    border: none;
    font-family: inherit;
  }

  .pill-btn.error {
    background: #D6453F;
    color: #fff;
    box-shadow: 0 1px 2px rgba(0,0,0,.2);
  }

  .pill-btn.setup {
    background: #ECECE9;
    color: #54585C;
    border: 1px solid rgba(0,0,0,.07);
    box-shadow: 0 1px 2px rgba(0,0,0,.08);
  }

  .pill-message {
    color: #D6453F;
    font-size: 12.5px;
    font-weight: 700;
    white-space: nowrap;
  }

  /* ── Tooltip ────────────────────────────────────────────────────── */
  .tooltip {
    position: absolute;
    bottom: calc(100% + 11px);
    right: 0;
    background: #1E1E1E;
    color: #fff;
    font-size: 12.5px;
    font-weight: 500;
    padding: 7px 11px;
    border-radius: 9px;
    white-space: nowrap;
    box-shadow: 0 10px 24px rgba(0,0,0,.34);
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.12s ease;
  }

  .outer:hover .tooltip { opacity: 1; }
  .outer.dragging .tooltip { opacity: 0; }

  .tooltip::after {
    content: '';
    position: absolute;
    right: 16px;
    bottom: -4px;
    width: 9px;
    height: 9px;
    background: #1E1E1E;
    transform: rotate(45deg);
  }

  /* ── Animations ─────────────────────────────────────────────────── */
  @keyframes barkPulse {
    0%, 100% { box-shadow: 0 0 0 2.5px #fff, 0 0 0 4px rgba(224,160,32,0); }
    50%       { box-shadow: 0 0 0 2.5px #fff, 0 0 0 7px rgba(224,160,32,.20); }
  }

  @keyframes barkShimmer {
    0%   { background-position: 0 0; }
    100% { background-position: 16px 0; }
  }
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function relTime(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ── State ─────────────────────────────────────────────────────────────────────

interface ChipState {
  rag: RagState;
  progress: { done: number; total: number } | null;
  lastBackupAt: string | null;
  errorKind: ErrorKind;
  amberReason: AmberReason;
  avatarUrl: string | null;
  showAvatar: boolean;
  xPct: number;
  yPct: number;
}

const DEFAULT_STATE: ChipState = {
  rag: 'amber',
  progress: null,
  lastBackupAt: null,
  errorKind: null,
  amberReason: null,
  avatarUrl: null,
  showAvatar: false,
  xPct: 77,
  yPct: 83,
};

function computeVisualState(s: ChipState): VisualState {
  if (s.amberReason === 'rate') return 'rate_limited';
  if (s.progress !== null) return 'backing_up';
  if (s.errorKind === 'permission') return 'perm_error';
  if (s.errorKind === 'auth') return 'auth_error';
  if (s.errorKind === 'error') return 'gen_error';
  if (s.rag === 'green') return 'backed_up';
  if (s.lastBackupAt == null) return 'never_backed_up';
  return 'incomplete';
}

const PILL_STATES: ReadonlySet<VisualState> = new Set([
  'rate_limited',
  'backing_up',
  'perm_error',
  'auth_error',
  'gen_error',
  'never_backed_up',
]);

// ── Chip ──────────────────────────────────────────────────────────────────────

class BarkChip {
  private readonly host: HTMLElement;
  private readonly shadow: ShadowRoot;
  private readonly outerEl: HTMLElement;
  private readonly pillWrapEl: HTMLElement;
  private readonly avatarWrapEl: HTMLElement;
  private readonly avatarEl: HTMLElement;
  private readonly avatarLetterEl: HTMLSpanElement;
  private readonly ragDotEl: HTMLElement;
  private readonly pillContentEl: HTMLElement;
  private readonly tooltipEl: HTMLElement;
  private avatarImgEl: HTMLImageElement | null = null;
  private state: ChipState = { ...DEFAULT_STATE };

  constructor() {
    this.host = document.createElement('div');
    this.shadow = this.host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = CSS;
    this.shadow.appendChild(style);

    this.outerEl = document.createElement('div');
    this.outerEl.className = 'outer';

    this.pillWrapEl = document.createElement('div');
    this.pillWrapEl.className = 'pill-wrap';

    this.avatarWrapEl = document.createElement('div');
    this.avatarWrapEl.className = 'avatar-wrap sz-34';

    this.avatarEl = document.createElement('div');
    this.avatarEl.className = 'avatar';

    this.avatarLetterEl = document.createElement('span');
    this.avatarLetterEl.className = 'avatar-letter';
    this.avatarLetterEl.textContent = 'b';
    this.avatarLetterEl.style.fontSize = '18px';

    this.avatarEl.appendChild(this.avatarLetterEl);
    this.avatarWrapEl.appendChild(this.avatarEl);

    this.ragDotEl = document.createElement('div');
    this.ragDotEl.className = 'rag-dot sz-34 col-grey';
    this.avatarWrapEl.appendChild(this.ragDotEl);

    this.pillWrapEl.appendChild(this.avatarWrapEl);

    this.pillContentEl = document.createElement('div');
    this.pillContentEl.className = 'pill-content';
    this.pillWrapEl.appendChild(this.pillContentEl);

    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'tooltip';

    this.outerEl.appendChild(this.pillWrapEl);
    this.outerEl.appendChild(this.tooltipEl);
    this.shadow.appendChild(this.outerEl);

    this._setupDrag();
    this._setupDoubleClick();
  }

  private _setupDrag(): void {
    const DRAG_THRESHOLD = 5;

    this.outerEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = this.host.offsetLeft;
      const startTop = this.host.offsetTop;
      let dragging = false;

      const onMove = (me: MouseEvent): void => {
        const dx = me.clientX - startX;
        const dy = me.clientY - startY;
        if (!dragging) {
          if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
          dragging = true;
          this.outerEl.classList.add('dragging');
        }
        const w = this.host.offsetWidth || 40;
        const h = this.host.offsetHeight || 40;
        const newLeft = clamp(startLeft + dx, 0, window.innerWidth - w);
        const newTop = clamp(startTop + dy, 0, window.innerHeight - h);
        this.host.style.left = `${newLeft}px`;
        this.host.style.right = 'auto';
        this.host.style.top = `${newTop}px`;
        this.host.style.bottom = 'auto';
      };

      const onUp = (): void => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (!dragging) return;
        dragging = false;
        this.outerEl.classList.remove('dragging');
        // Use chip's actual rendered position, not the mouse cursor
        const chipLeft = this.host.offsetLeft;
        const chipTop = this.host.offsetTop;
        const xPct = clamp((chipLeft / window.innerWidth) * 100, 0, 100);
        const yPct = clamp((chipTop / window.innerHeight) * 100, 0, 100);
        this.state.xPct = xPct;
        this.state.yPct = yPct;
        void chrome.storage.local.set({ chip_position: { xPct, yPct } });
        this._applyPosition();
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  private _setupDoubleClick(): void {
    this.outerEl.addEventListener('dblclick', () => {
      void chrome.runtime.sendMessage({ type: 'open_backup_page' });
    });
  }

  mount(): void {
    document.body.appendChild(this.host);
    this._applyPosition();

    chrome.storage.local.get(STORAGE_KEYS, (result) => {
      this._applyStorageResult(result);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const relevant = Object.keys(changes).some((k) =>
        STORAGE_KEYS.includes(k as keyof ChipStorage),
      );
      if (!relevant) return;
      chrome.storage.local.get(STORAGE_KEYS, (result) => {
        this._applyStorageResult(result);
      });
    });

    void chrome.runtime.sendMessage({ type: 'trigger_if_due' }).catch(() => {});
  }

  private _applyStorageResult(r: ChipStorage): void {
    if ('chip_enabled' in r) {
      this.host.style.display = r.chip_enabled === false ? 'none' : '';
    }
    if (r.chip_rag !== undefined) this.state.rag = r.chip_rag;
    if ('chip_progress' in r) this.state.progress = r.chip_progress ?? null;
    if ('chip_last_backup_at' in r) this.state.lastBackupAt = r.chip_last_backup_at ?? null;
    if (r.chip_error_kind !== undefined) this.state.errorKind = r.chip_error_kind;
    if ('chip_amber_reason' in r) this.state.amberReason = r.chip_amber_reason ?? null;
    if ('chip_avatar_url' in r) this.state.avatarUrl = r.chip_avatar_url ?? null;
    if (r.chip_show_avatar !== undefined) this.state.showAvatar = r.chip_show_avatar;
    if (r.chip_position) {
      this.state.xPct = r.chip_position.xPct;
      this.state.yPct = r.chip_position.yPct;
    }
    this._render();
    this._applyPosition();
  }

  private _applyPosition(): void {
    const chipW = this.host.offsetWidth || 34;
    const chipH = this.host.offsetHeight || 34;
    const x = (this.state.xPct / 100) * window.innerWidth;
    const y = (this.state.yPct / 100) * window.innerHeight;
    if (this.state.xPct > 50) {
      // Right-docked: anchor the right edge so the pill grows leftward
      this.host.style.right = `${clamp(window.innerWidth - x - chipW, 0, window.innerWidth - chipW)}px`;
      this.host.style.left = 'auto';
    } else {
      this.host.style.left = `${clamp(x, 0, window.innerWidth - chipW)}px`;
      this.host.style.right = 'auto';
    }
    this.host.style.top = `${clamp(y, 0, window.innerHeight - chipH)}px`;
    this.host.style.bottom = 'auto';
  }

  private _render(): void {
    const vs = computeVisualState(this.state);
    const isPill = PILL_STATES.has(vs);
    const avatarSize = isPill ? 28 : 34;

    // Avatar size
    this.avatarWrapEl.className = `avatar-wrap sz-${avatarSize}`;
    this.avatarLetterEl.style.fontSize = `${Math.round(avatarSize * 0.54)}px`;

    // Avatar image vs fallback letter
    const showPhoto = this.state.showAvatar && !!this.state.avatarUrl;
    if (showPhoto) {
      if (!this.avatarImgEl) {
        this.avatarImgEl = document.createElement('img');
        this.avatarImgEl.alt = '';
        this.avatarEl.insertBefore(this.avatarImgEl, this.avatarLetterEl);
      }
      this.avatarImgEl.src = this.state.avatarUrl!;
      this.avatarImgEl.style.display = '';
      this.avatarLetterEl.style.display = 'none';
    } else {
      if (this.avatarImgEl) this.avatarImgEl.style.display = 'none';
      this.avatarLetterEl.style.display = '';
    }

    // Pill wrap mode
    this.pillWrapEl.className = `pill-wrap${isPill ? ' pill-mode' : ''}`;

    // RAG dot
    let dotColour: string;
    let dotPulse = false;
    switch (vs) {
      case 'backing_up':
        dotColour = 'col-amber';
        dotPulse = true;
        break;
      case 'rate_limited':
      case 'incomplete':
        dotColour = 'col-amber';
        break;
      case 'never_backed_up':
        dotColour = 'col-grey';
        break;
      case 'backed_up':
        dotColour = 'col-green';
        break;
      default:
        dotColour = 'col-red';
    }
    this.ragDotEl.className = `rag-dot sz-${avatarSize} ${dotColour}${dotPulse ? ' pulse' : ''}`;

    // Pill content (clear and repopulate)
    this.pillContentEl.innerHTML = '';

    if (vs === 'backing_up' || vs === 'rate_limited') {
      const progress = this.state.progress;
      const done = progress?.done ?? 0;
      const total = Math.max(progress?.total ?? 1, 1);
      const pct = Math.round(clamp(done / total, 0, 1) * 100);

      const countEl = document.createElement('div');
      countEl.className = 'progress-count';
      const doneSpan = document.createElement('span');
      doneSpan.className = 'progress-done';
      doneSpan.textContent = String(done);
      const totalSpan = document.createElement('span');
      totalSpan.className = 'progress-total';
      totalSpan.textContent = ` / ${total}`;
      countEl.appendChild(doneSpan);
      countEl.appendChild(totalSpan);

      const barWrap = document.createElement('div');
      barWrap.className = 'progress-bar-wrap';
      const fill = document.createElement('div');
      fill.className = `progress-bar-fill${vs === 'backing_up' ? ' shimmer' : ''}`;
      fill.style.width = `${pct}%`;
      barWrap.appendChild(fill);

      this.pillContentEl.appendChild(countEl);
      this.pillContentEl.appendChild(barWrap);
    } else if (vs === 'perm_error' || vs === 'auth_error') {
      const btn = document.createElement('button');
      btn.className = 'pill-btn error';
      btn.textContent = vs === 'perm_error' ? 'Fix access' : 'Reauthorise';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        void chrome.runtime.sendMessage({ type: 'open_backup_page' });
      });
      this.pillContentEl.appendChild(btn);
    } else if (vs === 'gen_error') {
      const msg = document.createElement('span');
      msg.className = 'pill-message';
      msg.textContent = 'Backup error';
      this.pillContentEl.appendChild(msg);
    } else if (vs === 'never_backed_up') {
      const btn = document.createElement('button');
      btn.className = 'pill-btn setup';
      btn.textContent = 'Set up now';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        void chrome.runtime.sendMessage({ type: 'open_backup_page' });
      });
      this.pillContentEl.appendChild(btn);
    }

    // Tooltip text
    switch (vs) {
      case 'never_backed_up':
        this.tooltipEl.textContent = 'Not yet backed up';
        break;
      case 'backing_up':
        this.tooltipEl.textContent = 'Backup in progress';
        break;
      case 'rate_limited':
        this.tooltipEl.textContent = 'Paused — rate limit';
        break;
      case 'backed_up':
        this.tooltipEl.textContent = `Backed up ${relTime(this.state.lastBackupAt)}`;
        break;
      case 'incomplete':
        this.tooltipEl.textContent = 'Backup incomplete';
        break;
      case 'perm_error':
        this.tooltipEl.textContent = 'Folder access denied — double-click to fix';
        break;
      case 'auth_error':
        this.tooltipEl.textContent = 'Authentication expired — double-click to fix';
        break;
      case 'gen_error':
        this.tooltipEl.textContent = 'Backup error — double-click to view';
        break;
    }
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function mountChip(): void {
  if (document.querySelector('[data-b-ark-chip]')) return;

  const chip = new BarkChip();
  chip.mount();

  const el = document.body.lastElementChild as HTMLElement | null;
  if (el) el.dataset['bArkChip'] = '1';
}
