# b-oss Working Document

## Status

Working!

## TODO

Date picker in b-view grid and journal entries
One year forward/back in journal entries

README.md in backup folder to guide other AI tools using backups

## Bugs

Vite 8 deprecation warnings in b-view build — esbuild plugin option deprecated → migrate to oxc; optimizeDeps.esbuildOptions deprecated → migrate to optimizeDeps.rolldownOptions. Vite 9 will break these.

Invalid esbuild version constraint — vite@8 wants esbuild ^0.27.0 || ^0.28.0; electron-vite@5.0.0 pins esbuild ^0.25.11 and the older version hoists. Builds work, mismatch is cosmetic for now. Unblock by upgrading to electron-vite@6 once it goes stable (currently beta).
react / react-dom peer warnings — lucide-react and @testing-library/react show as missing peers at the root level despite being satisfied per-workspace. Decided to live with; revisit if it ever blocks anything.

electron-builder v26 → v27 upgrade — --publish always is now in place, so the breaking change in v27 is pre-empted. Upgrade itself is still future work.

## Testing Required

**API Limitations**
Not seeing hires or original image links populated in pracice
No ability to read extras

## Key Commands

**Rebuild Everything**
npm run build

**Run b-ark in dev mode**
npm run dev --workspace=packages/b-ark
