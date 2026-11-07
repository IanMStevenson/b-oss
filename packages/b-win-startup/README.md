# b-win-startup

Rust Node-API add-on that reads and changes the Microsoft Store (MSIX) startup task an app declares
in its manifest (`Windows.ApplicationModel.StartupTask`). Shared by b-ark and b-mobile-pc
([b-oss#888](https://github.com/IanMStevenson/b-oss/issues/888)); the task id is passed in per call, so it
holds nothing app-specific.

- Build (Windows x64, needs Rust): `node packages/b-win-startup/build.mjs` → `dist/win-startup.node`.
  The MSIX workflows run it. It is not part of `npm run build` (it needs a Rust toolchain, which Linux dev machines may not have).
- Use: each app's `electron-builder.store.json` copies `dist/win-startup.node` to `resources/native/`
  (`extraResources`); the app loads it from `process.resourcesPath`. Nothing imports this package as JS.
- API: `getState(taskId)`, `enable(taskId)`, `disable(taskId)`, each resolving to the StartupTaskState name.
  `enable` acts only from `Disabled`; `disable` only from `Enabled`.
- `launchKind()` resolves to how the process was activated: `StartupTask` (Windows started it at sign-in),
  `Launch` (the user did), `Protocol`, `File`, `Other` or `Unknown`
  ([b-oss#885](https://github.com/IanMStevenson/b-oss/issues/885)). A startup-task launch passes no arguments, so
  this is the only way to tell. Windows hands the activation arguments out once, so the add-on keeps the first
  answer; call it early.
