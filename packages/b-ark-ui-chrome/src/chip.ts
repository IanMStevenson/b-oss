// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Draggable chip content script (vanilla TS, shadow DOM, no React).
// Injects a floating b-ark status chip into any host page.

type RagState = 'green' | 'amber' | 'red';
type ErrorKind = 'permission' | 'auth' | null;

interface ChipStorage {
  chip_rag?: RagState;
  chip_progress?: { done: number; total: number } | null;
  chip_last_backup_at?: string | null;
  chip_error_kind?: ErrorKind;
  chip_position?: { xPct: number; yPct: number };
}

const STORAGE_KEYS: (keyof ChipStorage)[] = [
  'chip_rag',
  'chip_progress',
  'chip_last_backup_at',
  'chip_error_kind',
  'chip_position',
];

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
  :host {
    all: initial;
    display: block;
    position: fixed;
    z-index: 2147483647;
    pointer-events: none;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .chip {
    pointer-events: auto;
    cursor: grab;
    border-radius: 999px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.18);
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 0 10px 0 4px;
    height: 36px;
    min-width: 36px;
    white-space: nowrap;
    user-select: none;
    transition: box-shadow 0.15s ease;
    background: #1f4d3a;
    color: white;
    font-size: 13px;
    font-weight: 600;
  }

  .chip:hover { box-shadow: 0 4px 18px rgba(0,0,0,0.24); }
  .chip.dragging { cursor: grabbing; box-shadow: 0 6px 24px rgba(0,0,0,0.30); }
  .chip.green { background: #1f4d3a; }
  .chip.amber { background: #b07c1a; }
  .chip.red   { background: #b03030; }

  .chip.icon-only { padding: 0; width: 36px; justify-content: center; }

  .avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: rgba(255,255,255,0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    flex-shrink: 0;
    overflow: hidden;
  }

  .avatar img { width: 100%; height: 100%; object-fit: cover; }

  .rag-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #22a06b;
    flex-shrink: 0;
  }
  .rag-dot.amber { background: #e8a93c; }
  .rag-dot.red   { background: #d04545; }

  .progress { font-variant-numeric: tabular-nums; }

  .tooltip {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.85);
    color: white;
    font-size: 11.5px;
    padding: 4px 9px;
    border-radius: 5px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.12s ease;
  }

  .chip:hover .tooltip { opacity: 1; }
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function relTime(iso: string | null | undefined): string {
  if (!iso) return 'Never backed up';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Backed up just now';
  if (mins < 60) return `Backed up ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Backed up ${hrs}h ago`;
  return `Backed up ${Math.floor(hrs / 24)}d ago`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ── Chip ──────────────────────────────────────────────────────────────────────

interface ChipState {
  rag: RagState;
  progress: { done: number; total: number } | null;
  lastBackupAt: string | null;
  errorKind: ErrorKind;
  xPct: number;
  yPct: number;
}

const DEFAULT_STATE: ChipState = {
  rag: 'green',
  progress: null,
  lastBackupAt: null,
  errorKind: null,
  xPct: 96,
  yPct: 90,
};

class BarkChip {
  private readonly host: HTMLElement;
  private readonly shadow: ShadowRoot;
  private readonly chipEl: HTMLElement;
  private readonly avatarEl: HTMLElement;
  private readonly dotEl: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly tooltipEl: HTMLElement;
  private state: ChipState = { ...DEFAULT_STATE };
  private dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private hostStartLeft = 0;
  private hostStartTop = 0;

  constructor() {
    this.host = document.createElement('div');
    this.shadow = this.host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = CSS;
    this.shadow.appendChild(style);

    this.chipEl = document.createElement('div');
    this.chipEl.className = 'chip green icon-only';

    this.avatarEl = document.createElement('div');
    this.avatarEl.className = 'avatar';
    this.avatarEl.textContent = 'b';

    this.dotEl = document.createElement('div');
    this.dotEl.className = 'rag-dot';

    this.textEl = document.createElement('span');
    this.textEl.className = 'progress';

    this.tooltipEl = document.createElement('div');
    this.tooltipEl.className = 'tooltip';
    this.tooltipEl.textContent = 'b-ark';

    this.chipEl.appendChild(this.avatarEl);
    this.chipEl.appendChild(this.dotEl);
    this.chipEl.appendChild(this.textEl);
    this.chipEl.appendChild(this.tooltipEl);
    this.shadow.appendChild(this.chipEl);

    this._setupDrag();
    this._setupDoubleClick();
  }

  private _setupDrag(): void {
    this.chipEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.dragging = true;
      this.chipEl.classList.add('dragging');
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.hostStartLeft = this.host.offsetLeft;
      this.hostStartTop = this.host.offsetTop;

      const onMove = (me: MouseEvent): void => {
        if (!this.dragging) return;
        const dx = me.clientX - this.dragStartX;
        const dy = me.clientY - this.dragStartY;
        const newLeft = clamp(this.hostStartLeft + dx, 0, window.innerWidth - 40);
        const newTop = clamp(this.hostStartTop + dy, 0, window.innerHeight - 40);
        this.host.style.left = `${newLeft}px`;
        this.host.style.top = `${newTop}px`;
        this.host.style.right = 'auto';
        this.host.style.bottom = 'auto';
      };

      const onUp = (ue: MouseEvent): void => {
        if (!this.dragging) return;
        this.dragging = false;
        this.chipEl.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);

        // Persist as percentage from edges
        const xPct = clamp((ue.clientX / window.innerWidth) * 100, 0, 100);
        const yPct = clamp((ue.clientY / window.innerHeight) * 100, 0, 100);
        this.state.xPct = xPct;
        this.state.yPct = yPct;
        void chrome.storage.local.set({ chip_position: { xPct, yPct } });
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  private _setupDoubleClick(): void {
    this.chipEl.addEventListener('dblclick', () => {
      void chrome.runtime.sendMessage({ type: 'open_backup_page' });
    });
  }

  mount(): void {
    document.body.appendChild(this.host);
    this._applyPosition();

    // Load initial state and subscribe to changes
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
  }

  private _applyStorageResult(r: ChipStorage): void {
    if (r.chip_rag !== undefined) this.state.rag = r.chip_rag;
    if ('chip_progress' in r) this.state.progress = r.chip_progress ?? null;
    if ('chip_last_backup_at' in r) this.state.lastBackupAt = r.chip_last_backup_at ?? null;
    if (r.chip_error_kind !== undefined) this.state.errorKind = r.chip_error_kind;
    if (r.chip_position) {
      this.state.xPct = r.chip_position.xPct;
      this.state.yPct = r.chip_position.yPct;
    }
    this._render();
    this._applyPosition();
  }

  private _applyPosition(): void {
    const x = (this.state.xPct / 100) * window.innerWidth;
    const y = (this.state.yPct / 100) * window.innerHeight;
    this.host.style.left = `${clamp(x, 0, window.innerWidth - 40)}px`;
    this.host.style.top = `${clamp(y, 0, window.innerHeight - 40)}px`;
    this.host.style.right = 'auto';
    this.host.style.bottom = 'auto';
  }

  private _render(): void {
    const { rag, progress, lastBackupAt, errorKind } = this.state;
    const isRunning = progress !== null;

    // rag class
    this.chipEl.className = `chip ${rag}`;

    // dot
    this.dotEl.className = `rag-dot${rag === 'amber' ? ' amber' : rag === 'red' ? ' red' : ''}`;
    this.dotEl.style.display = isRunning || rag !== 'green' ? 'block' : 'none';

    if (rag === 'green' && !isRunning) {
      // Compact: just avatar + green ring
      this.chipEl.classList.add('icon-only');
      this.dotEl.style.display = 'block';
      this.textEl.textContent = '';
      this.tooltipEl.textContent = relTime(lastBackupAt);
    } else if (isRunning && progress) {
      // Amber running: show progress
      this.chipEl.classList.remove('icon-only');
      this.textEl.textContent = `${progress.done}/${progress.total}`;
      this.tooltipEl.textContent = 'Backup in progress';
    } else if (rag === 'red') {
      // Red error
      this.chipEl.classList.remove('icon-only');
      this.textEl.textContent = errorKind === 'auth' ? 'Reauthorise' : 'Fix access';
      this.tooltipEl.textContent =
        errorKind === 'auth'
          ? 'Authentication expired'
          : 'Folder access denied — double-click to fix';
    } else {
      // Amber idle (chip_rag set to amber at backup start before progress arrives)
      this.chipEl.classList.remove('icon-only');
      this.textEl.textContent = 'Starting…';
      this.tooltipEl.textContent = 'Backup starting';
    }
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function mountChip(): void {
  if (document.querySelector('[data-b-ark-chip]')) return;

  const chip = new BarkChip();
  chip.mount();

  // Mark host so duplicate injection is a no-op
  const hosts = document.querySelectorAll('[data-b-ark-chip-pending]');
  if (hosts.length === 0) {
    // The host element was appended in mount() — mark it
    const el = document.body.lastElementChild as HTMLElement | null;
    if (el) el.dataset['bArkChip'] = '1';
  }
}
