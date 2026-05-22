/* blipark — top-level app. Orchestrates which screen is shown. */

const { useState: useS, useEffect: useE, useRef: useR } = React;

const SCREENS = [
  { key: "first-open", label: "First open" },
  { key: "oauth-success", label: "OAuth success" },
  { key: "empty", label: "Empty account" },
  { key: "home", label: "Home" },
  { key: "home-backup", label: "Backup running" },
  { key: "home-settings", label: "Settings panel" },
  { key: "home-log", label: "Log panel" },
];

function App() {
  const [screen, setScreen] = useS("home");
  const [selected, setSelected] = useS(ACCOUNTS[0].id);
  const [thumbSize, setThumbSize] = useS(100);
  const [backupProgress, setBackupProgress] = useS(0);

  const account = ACCOUNTS.find(a => a.id === selected) || ACCOUNTS[0];

  // animate progress when on backup screen
  useE(() => {
    if (screen !== "home-backup") { setBackupProgress(0); return; }
    setBackupProgress(0);
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const elapsed = (now - start) / 1000;
      // ease toward ~94% over ~7s
      const pct = Math.min(94, 100 * (1 - Math.exp(-elapsed / 2.6)));
      setBackupProgress(pct);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [screen]);

  const inPanel = screen === "home-settings" || screen === "home-log";
  const sidebarDisabled = inPanel;

  let mainEl = null;
  switch (screen) {
    case "first-open":
      mainEl = <FirstOpenScreen onAdd={() => setScreen("oauth-success")} />;
      break;
    case "oauth-success":
      mainEl = <OAuthSuccessScreen onSetUp={() => setScreen("home-settings")} />;
      break;
    case "empty":
      mainEl = (
        <EmptyAccountScreen
          account={{ ...account, folder: "/Users/fern/Pictures/blipark/" + account.id }}
          onSettings={() => setScreen("home-settings")}
          onBackup={() => setScreen("home-backup")}
        />
      );
      break;
    case "home":
    case "home-backup":
      mainEl = (
        <HomeScreen
          account={account}
          thumbSize={thumbSize}
          onThumbSize={setThumbSize}
          onSettings={() => setScreen("home-settings")}
          onLog={() => setScreen("home-log")}
          onBackup={() => setScreen("home-backup")}
          backupRunning={screen === "home-backup"}
          backupProgress={backupProgress}
        />
      );
      break;
    case "home-settings":
      mainEl = <SettingsPanel account={account} onClose={() => setScreen("home")} />;
      break;
    case "home-log":
      mainEl = <LogPanel account={account} onClose={() => setScreen("home")} />;
      break;
    default:
      mainEl = <HomeScreen account={account} thumbSize={thumbSize} onThumbSize={setThumbSize}
        onSettings={() => setScreen("home-settings")} onLog={() => setScreen("home-log")}
        onBackup={() => setScreen("home-backup")} backupRunning={false} backupProgress={0} />;
  }

  const showSidebar = screen !== "first-open" && screen !== "oauth-success";

  return (
    <div className="viewport">
      <div className="window" data-screen-label={"01 " + (SCREENS.find(s => s.key === screen)?.label || screen)}>
        <TopBar />
        <div className="screen-tabs" role="tablist" aria-label="Prototype screens">
          <span className="label">Prototype screens</span>
          {SCREENS.map(s => (
            <button
              key={s.key}
              className={screen === s.key ? "on" : ""}
              onClick={() => setScreen(s.key)}
              data-screen-label={s.label}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="body">
          {showSidebar && (
            <Sidebar
              accounts={ACCOUNTS}
              selected={selected}
              onSelect={setSelected}
              disabled={sidebarDisabled}
              onAdd={() => setScreen("first-open")}
            />
          )}
          {mainEl}
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
