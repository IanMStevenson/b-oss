/* Screen components for blipark prototype.
   All components are static; navigation is driven by the parent. */

const { useState, useMemo, useRef, useEffect } = React;

const ACCOUNTS = [
  {
    id: "fern",
    journal: "Hedgerow Days",
    user: "@fernwright",
    initials: "F",
    rag: "green",
    lastSync: "2 hours ago",
    nextRun: "Tomorrow at 03:00",
    totalBlips: 4_812,
    sinceDate: "20 Aug 2014",
    folder: "/Users/fern/Pictures/blipark/hedgerow",
  },
  {
    id: "owen",
    journal: "Owen's Daily",
    user: "@owenmac",
    initials: "O",
    rag: "amber",
    lastSync: "8 days ago",
    nextRun: "Today at 22:00",
    totalBlips: 1_237,
    sinceDate: "04 Jan 2022",
    folder: "/Users/fern/Pictures/blipark/owen",
  },
  {
    id: "mira",
    journal: "Allotment Year",
    user: "@miragreen",
    initials: "M",
    rag: "green",
    lastSync: "2 hours ago",
    nextRun: "Tomorrow at 04:00",
    totalBlips: 712,
    sinceDate: "12 Mar 2023",
    folder: "/Users/fern/Pictures/blipark/allotment",
  },
  {
    id: "salt",
    journal: "Saltwater Notes",
    user: "@saltwater",
    initials: "S",
    rag: "red",
    lastSync: "Failed yesterday",
    nextRun: "Paused",
    totalBlips: 88,
    sinceDate: "01 May 2026",
    folder: "/Users/fern/Pictures/blipark/saltwater",
    error: "API token expired — reauthorise account",
  },
];

const LOG_ENTRIES = [
  { t: "14:02:11", lvl: "info", msg: "Scheduled run started for journal “Hedgerow Days”." },
  { t: "14:02:12", lvl: "info", msg: "Fetched account profile. 4,812 entries reported by remote." },
  { t: "14:02:14", lvl: "info", msg: "Gap check window: 31 days. Comparing 31 remote entries against local archive." },
  { t: "14:02:18", lvl: "success", msg: "Local archive in sync within gap check window. No missing entries." },
  { t: "14:02:18", lvl: "info", msg: "Redo window: refreshing 7 most recent entries." },
  { t: "14:02:21", lvl: "success", msg: "Entry 2026-05-19 “Foxgloves at the field edge” saved (image + metadata + comments)." },
  { t: "14:02:23", lvl: "success", msg: "Entry 2026-05-18 “Late kitchen light” saved (image + metadata + comments)." },
  { t: "14:02:25", lvl: "warn", msg: "Entry 2026-05-17 has 14 comments; 1 comment author profile could not be resolved. Saved anyway." },
  { t: "14:02:27", lvl: "success", msg: "Entry 2026-05-16 “Wet pavement, six pm” saved." },
  { t: "14:02:29", lvl: "success", msg: "Entry 2026-05-15 “Bus stop” saved." },
  { t: "14:02:31", lvl: "success", msg: "Entry 2026-05-14 “Hawthorn” saved." },
  { t: "14:02:34", lvl: "error", msg: "Entry 2026-05-13: image fetch returned 504 from CDN after 3 retries. Will reattempt on next run." },
  { t: "14:02:35", lvl: "info", msg: "Writing index manifest. 4,812 entries, 4,811 with images, 11.4 GB on disk." },
  { t: "14:02:36", lvl: "success", msg: "Run completed: 6 entries written, 1 deferred, 0 deleted. Duration 25.3s." },
];

/* ---------------- Top bar ---------------- */

function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar-traffic"><span></span><span></span><span></span></div>
      <div className="brand">blipark</div>
      <div className="topbar-spacer"></div>
      <div className="topbar-right">
        <span>v1.4.2</span>
        <span className="sep"></span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <I.shield size={13} />
          Connected
        </span>
      </div>
    </header>
  );
}

/* ---------------- Sidebar ---------------- */

function Sidebar({ accounts, selected, onSelect, disabled, onAdd }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Accounts</h2>
        <button className="icon-btn" title="Search" disabled={disabled}>
          <I.search size={14} />
        </button>
      </div>
      <div className="account-list">
        {accounts.map(a => (
          <div
            key={a.id}
            className={`account ${selected === a.id ? "selected" : ""} ${disabled ? "disabled" : ""}`}
            onClick={() => !disabled && onSelect(a.id)}
          >
            <div className="account-handle" title="Drag to reorder">
              <I.grip size={14} />
            </div>
            <Avatar seed={a.initials} size={34} />
            <div className="account-meta">
              <div className="account-title">{a.journal}</div>
              <div className="account-user">{a.user}</div>
            </div>
            <div className={`rag ${a.rag} ${a.rag === "green" && selected === a.id ? "pulse" : ""}`} title={ragLabel(a.rag)} />
          </div>
        ))}
      </div>
      <button className="sidebar-add" onClick={onAdd} disabled={disabled}>
        <I.plus size={14} />
        Add account…
      </button>
    </aside>
  );
}

function ragLabel(r) {
  return r === "green" ? "Up to date" : r === "amber" ? "Catching up" : "Needs attention";
}

/* ---------------- Home (account detail w/ grid) ---------------- */

function HomeScreen({ account, thumbSize, onThumbSize, onSettings, onLog, onBackup, backupRunning, backupProgress }) {
  const cols = useMemo(() => {
    // Width per thumb scaled by thumbSize percentage (100 = 8 cols baseline)
    const base = 8;
    const scaled = Math.round(base * (100 / thumbSize));
    return Math.max(4, Math.min(14, scaled));
  }, [thumbSize]);

  const seeds = useMemo(() => {
    return new Array(96).fill(0).map((_, i) => account.id + "-" + i);
  }, [account.id]);

  return (
    <section className="main">
      <header className="main-header">
        <div className="title-row">
          <Avatar seed={account.initials} size={40} />
          <div className="title-block">
            <h1>{account.journal}</h1>
            <div className="sub">
              {account.user} · since {account.sinceDate} · {account.totalBlips.toLocaleString()} entries
            </div>
          </div>
        </div>
        <div className="toolbar">
          <div className="group">
            <button className="icon-btn" title="Decrease thumbnail size" onClick={() => onThumbSize(Math.max(50, thumbSize - 10))}>
              <I.zoomOut size={15} />
            </button>
            <div className="label">{thumbSize}%</div>
            <button className="icon-btn" title="Increase thumbnail size" onClick={() => onThumbSize(Math.min(200, thumbSize + 10))}>
              <I.zoomIn size={15} />
            </button>
            <button className="icon-btn" title="Reset" onClick={() => onThumbSize(100)}>
              <I.reset size={14} />
            </button>
          </div>
          <button className="icon-btn outlined" title="View" onClick={() => {}}>
            <I.layoutGrid size={15} />
          </button>
          <button className="icon-btn outlined" title="Logs" onClick={onLog}>
            <I.fileText size={15} />
          </button>
          <button className="icon-btn outlined" title="Settings" onClick={onSettings}>
            <I.settings size={15} />
          </button>
          <button className="btn primary" onClick={onBackup} disabled={backupRunning}>
            <I.cloudDown size={14} />
            {backupRunning ? "Backing up…" : "Backup now"}
          </button>
        </div>
      </header>

      {backupRunning && (
        <div className="backup-banner">
          <I.refresh size={15} className="spin" style={{ animation: "spin 1.1s linear infinite" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, color: "var(--green-900)" }}>
              Backing up “{account.journal}”
            </div>
            <div style={{ color: "var(--muted)", marginTop: 2 }}>
              Writing entries to <span style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>{account.folder}</span>
            </div>
          </div>
          <div style={{ width: 220, display: "flex", alignItems: "center", gap: 10 }}>
            <div className="progress"><i style={{ width: backupProgress + "%" }} /></div>
            <div className="backup-counts">{Math.round(backupProgress * 0.07)}/7</div>
          </div>
        </div>
      )}

      <div className="grid-wrap">
        <div
          className="thumb-grid"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {seeds.map(s => <PhotoThumb key={s} seed={s} />)}
        </div>
      </div>

      <footer className="status">
        <span className="stat"><div className={`rag ${account.rag}`} /> <strong>{ragLabel(account.rag)}</strong></span>
        <span className="stat"><I.archive size={12} /> <strong>{account.totalBlips.toLocaleString()}</strong> archived</span>
        <span className="stat"><I.cal size={12} /> Last entry: <strong>19 May 2026</strong></span>
        <span className="stat"><I.clock size={12} /> Last backup: <strong>{account.lastSync}</strong> · next {account.nextRun}</span>
        <span className="spacer"></span>
        {account.error && (
          <span className="err"><I.alert size={12} /> {account.error}</span>
        )}
        <span className="status-link" onClick={onLog}><I.fileText size={12} /> View log</span>
      </footer>
    </section>
  );
}

/* ---------------- First open ---------------- */

function FirstOpenScreen({ onAdd }) {
  return (
    <section className="main">
      <div className="empty">
        <div className="empty-card first-open">
          <div className="badge">
            <I.archive size={32} />
          </div>
          <h1>Welcome to blipark</h1>
          <p>
            blipark keeps a local backup of your Blipfoto journals — photos, captions, comments,
            metadata — written to disk in folders you control.
          </p>
          <div className="btn-row">
            <button className="btn primary lg" onClick={onAdd}>
              <I.plus size={14} />
              Add account
            </button>
          </div>
          <div style={{ marginTop: 22, color: "var(--muted)", fontSize: 12, display: "flex", gap: 6, alignItems: "center", justifyContent: "center" }}>
            <I.shield size={12} />
            You'll be taken to Blipfoto to authorise access in your browser.
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- OAuth success ---------------- */

function OAuthSuccessScreen({ onSetUp }) {
  return (
    <section className="main">
      <div className="oauth-success">
        <div className="oauth-card">
          <div className="check-badge">
            <I.check size={32} style={{ strokeWidth: 2.4 }} />
          </div>
          <h1>Account connected</h1>
          <p className="lead">blipark has access to read your journal.</p>

          <div className="profile-card">
            <Avatar seed="F" size={64} />
            <div className="who">
              <h2>Hedgerow Days</h2>
              <div className="handle">@fernwright · joined Aug 2014</div>
              <div className="stat-row">
                <div className="stat-block">
                  <div className="v">4,812</div>
                  <div className="k">Entries</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn lg">Skip for now</button>
            <button className="btn primary lg" onClick={onSetUp}>
              Set up now
              <I.chevR size={14} />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Empty state (newly-added, no blips yet) ---------------- */

function EmptyAccountScreen({ account, onSettings, onBackup }) {
  return (
    <section className="main">
      <header className="main-header">
        <div className="title-row">
          <Avatar seed={account.initials} size={40} />
          <div className="title-block">
            <h1>{account.journal}</h1>
            <div className="sub">{account.user} · awaiting first backup</div>
          </div>
        </div>
        <div className="toolbar">
          <button className="icon-btn outlined" title="Settings" onClick={onSettings}>
            <I.settings size={15} />
          </button>
          <button className="btn primary" onClick={onBackup}>
            <I.cloudDown size={14} />
            Run first backup
          </button>
        </div>
      </header>

      <div className="empty">
        <div className="empty-card">
          <div className="badge">
            <I.folderOpen size={28} />
          </div>
          <h1>No blips archived yet</h1>
          <p>
            You're set up. Run your first backup to pull every entry from Blipfoto into{" "}
            <span style={{ fontFamily: "ui-monospace, Menlo, monospace", color: "var(--ink-2)" }}>
              {account.folder}
            </span>
            . You can leave blipark running and it will follow your schedule.
          </p>
          <div className="btn-row">
            <button className="btn" onClick={onSettings}>
              <I.settings size={14} />
              Review settings
            </button>
            <button className="btn primary" onClick={onBackup}>
              <I.cloudDown size={14} />
              Run first backup
            </button>
          </div>
        </div>
      </div>

      <footer className="status">
        <span className="stat"><div className="rag amber" /> <strong>Awaiting first backup</strong></span>
        <span className="stat"><I.archive size={12} /> <strong>0</strong> archived</span>
        <span className="stat"><I.folder size={12} /> {account.folder}</span>
        <span className="spacer"></span>
      </footer>
    </section>
  );
}

/* ---------------- Settings panel ---------------- */

function SettingsPanel({ account, onClose }) {
  const [folder, setFolder] = useState(account.folder);
  const [date, setDate] = useState("2026-05-21");
  const [hour, setHour] = useState("03:00");
  const [interval, setInterval] = useState("Daily");
  const [gap, setGap] = useState(31);
  const [redo, setRedo] = useState(7);

  return (
    <aside className="right-panel">
      <header className="right-panel-head">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <I.settings size={16} style={{ color: "var(--green-800)" }} />
          <h2>Settings · {account.journal}</h2>
        </div>
        <button className="icon-btn" onClick={onClose} title="Close">
          <I.x size={16} />
        </button>
      </header>
      <div className="right-panel-body">
        <div className="right-panel-inner">

        <div className="setting">
          <div className="setting-label">
            <span className="name">Folder</span>
            <span className="hint">Where backups are written</span>
          </div>
          <div className="field field-with-button">
            <input className="input mono flex" value={folder} onChange={e => setFolder(e.target.value)} />
            <button className="btn">
              <I.folderOpen size={13} />
              Choose…
            </button>
          </div>
        </div>

        <div className="setting">
          <div className="setting-label">
            <span className="name">Schedule</span>
            <span className="hint">Next run will follow this</span>
          </div>
          <p className="setting-desc">
            blipark will check for new entries at this time, and then again every interval.
          </p>
          <div className="inline-row" style={{ marginBottom: 8 }}>
            <span className="label-sm">Date</span>
            <div className="field field-with-button" style={{ flex: 1 }}>
              <input className="input mono flex" value={date} onChange={e => setDate(e.target.value)} />
              <button className="btn"><I.cal size={13} /></button>
            </div>
          </div>
          <div className="inline-row" style={{ marginBottom: 8 }}>
            <span className="label-sm">Time</span>
            <select className="select" value={hour} onChange={e => setHour(e.target.value)} style={{ flex: 1 }}>
              {Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`).map(h => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </div>
          <div className="inline-row">
            <span className="label-sm">Every</span>
            <select className="select" value={interval} onChange={e => setInterval(e.target.value)} style={{ flex: 1 }}>
              <option>Daily</option>
              <option>Weekly</option>
              <option>Monthly</option>
            </select>
          </div>
        </div>

        <div className="setting">
          <div className="setting-label">
            <span className="name">Gap check</span>
            <span className="hint">Days to look back</span>
          </div>
          <p className="setting-desc">
            On each run, look back this many days and fill in any missing entries.
          </p>
          <div className="field">
            <input className="input num" type="number" value={gap} onChange={e => setGap(+e.target.value || 0)} />
            <span style={{ color: "var(--muted)", fontSize: 12 }}>days</span>
          </div>
        </div>

        <div className="setting">
          <div className="setting-label">
            <span className="name">Redo</span>
            <span className="hint">Most-recent entries to refresh</span>
          </div>
          <p className="setting-desc">
            Re-download this many of the latest entries each run, in case captions or comments
            have changed since the last backup.
          </p>
          <div className="field">
            <input className="input num" type="number" value={redo} onChange={e => setRedo(+e.target.value || 0)} />
            <span style={{ color: "var(--muted)", fontSize: 12 }}>entries</span>
          </div>
        </div>

        <div className="setting">
          <div className="setting-label">
            <span className="name">Account</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn"><I.refresh size={13} /> Reauthorise</button>
            <button className="btn" style={{ color: "var(--rag-red)" }}>
              <I.trash size={13} /> Remove account
            </button>
          </div>
        </div>
        </div>
      </div>
    </aside>
  );
}

/* ---------------- Log panel ---------------- */

function LogPanel({ account, onClose }) {
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? LOG_ENTRIES : LOG_ENTRIES.filter(e => e.lvl === filter);
  return (
    <aside className="right-panel">
      <header className="right-panel-head">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <I.fileText size={16} style={{ color: "var(--green-800)" }} />
          <h2>Log · {account.journal}</h2>
        </div>
        <button className="icon-btn" onClick={onClose} title="Close">
          <I.x size={16} />
        </button>
      </header>

      <div className="log-toolbar">
        <span>Filter</span>
        <div className="log-filter">
          {[
            ["all", "All", null],
            ["error", "Errors", "error"],
            ["warn", "Warnings", "warn"],
            ["success", "Success", "success"],
            ["info", "Info", "info"],
          ].map(([k, label, kind]) => (
            <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>
              {kind && <span className={`log-icon ${kind}`} style={{ width: 10, height: 10 }} />}
              {label}
            </button>
          ))}
        </div>
        <span style={{ flex: 1 }}></span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{filtered.length} of {LOG_ENTRIES.length}</span>
      </div>

      <div className="right-panel-body">
        <div className="log">
          {filtered.map((e, i) => (
            <div key={i} className={`log-row ${e.lvl === "error" ? "err" : e.lvl === "warn" ? "warn" : ""}`}>
              <div className="icon-cell">
                <span className={`log-icon ${e.lvl}`}>
                  {e.lvl === "error" && <I.x size={10} style={{ strokeWidth: 3 }} />}
                  {e.lvl === "warn" && <I.warn size={10} style={{ strokeWidth: 2.4 }} />}
                  {e.lvl === "success" && <I.check size={10} style={{ strokeWidth: 3 }} />}
                  {e.lvl === "info" && <span style={{ fontFamily: "Helvetica", fontWeight: 700, fontSize: 9 }}>i</span>}
                </span>
              </div>
              <div className="stamp">{e.t}</div>
              <div className="msg">{e.msg}</div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

Object.assign(window, {
  ACCOUNTS, TopBar, Sidebar, HomeScreen,
  FirstOpenScreen, OAuthSuccessScreen, EmptyAccountScreen,
  SettingsPanel, LogPanel,
});
