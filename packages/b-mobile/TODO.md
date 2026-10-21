Implement photo downsizing for upload

Move APP settings including downsizing, responding to links etc to a single screen

- Downsizing (Misc) and Browsing already live together in Settings' "App Settings" group as of
  bb88247 (2026-08-12).
- Still outstanding: "Open blipfoto.com links in this app" is still on the Help & Info screen
  (HelpInfoScreen.tsx), not Settings — the one App-settings-shaped preference not yet moved.
