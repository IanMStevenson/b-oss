# b-ark resources

Icon and metadata files referenced by Electron at runtime and by electron-builder when packaging.

## Files

```
packages/b-ark/resources/
├── tray-icon.png          # 32×32 system tray icon (Windows/Linux)               [done]
├── tray-icon-16.png       # optional 16×16 for pixel-perfect 100% DPI taskbars   [done]
├── icon.ico               # multi-resolution Windows icon (16/24/32/48/64/128/256) [done]
├── icon-ico/              # PNG sources that icon.ico was assembled from         [archive]
├── icon.iconset/          # PNG sources for icon.icns (Apple naming convention)  [archive]
├── icon.icns              # macOS app icon                                       [missing]
└── entitlements.mac.plist # macOS hardened-runtime entitlements                  [missing]
```

The `.icns` and `.plist` are only required when building for macOS (`electron-builder --mac`). Windows builds are unblocked.

## How each file is used

- **`tray-icon.png`** — loaded by [`src/main/tray.ts`](../src/main/tray.ts) on app start. In dev, resolved relative to `__dirname`; in packaged builds, from `process.resourcesPath/resources/`.
- **`icon.ico`** — referenced by `win.icon` in [`electron-builder.config.json`](../electron-builder.config.json) for the `.exe`, NSIS installer, and uninstaller.
- **`icon.icns`** — referenced by `mac.icon` in the same config.

## Rebuilding `icon.ico` from PNG sources

The seven PNGs in `icon-ico/` cover the Microsoft-recommended size set. The small sizes (16, 24, 32) are hand-simplified — no shadow, chunkier glyph — so the `b` stays legible at toolbar / Explorer-tiny scale.

### ImageMagick

```bash
cd packages/b-ark/resources/icon-ico
magick convert icon-16.png icon-24.png icon-32.png icon-48.png icon-64.png icon-128.png icon-256.png ../icon.ico
```

### png-to-ico (Node, no external dependency)

```bash
npx png-to-ico icon-16.png icon-24.png icon-32.png icon-48.png icon-64.png icon-128.png icon-256.png > ../icon.ico
```

### PowerShell (no tooling required)

The current `icon.ico` was built directly in PowerShell by packing each PNG as a payload inside an ICO container. See conversation history if it needs to be regenerated that way again.

## Building `icon.icns` from `icon.iconset/`

The iconset folder uses Apple's required filenames and pairs every logical size with its `@2x` retina variant; the master is `icon_512x512@2x.png` at 1024×1024.

> **One-off rename.** The PNGs were saved with `-2x` instead of `@2x` because the source environment couldn't write `@` into filenames. Run once before packaging:
>
> ```bash
> cd packages/b-ark/resources/icon.iconset
> for f in *-2x.png; do mv "$f" "${f%-2x.png}@2x.png"; done
> ```

### macOS (`iconutil` is built in)

```bash
cd packages/b-ark/resources
iconutil -c icns icon.iconset -o icon.icns
```

### Cross-platform fallback (`png2icns` from libicns)

```bash
png2icns icon.icns \
  icon.iconset/icon_16x16.png \
  icon.iconset/icon_32x32.png \
  icon.iconset/icon_128x128.png \
  icon.iconset/icon_256x256.png \
  icon.iconset/icon_512x512.png \
  icon.iconset/icon_512x512@2x.png
```

Both routes require the `-2x → @2x` rename above; `iconutil` will reject the folder otherwise.

## Design tokens (for regenerating the mark)

- Background: `#1f4d3a` (matches the app's top bar)
- Glyph: white `b`, Helvetica Neue / Helvetica / Arial, weight 700 at ≥48 px and weight 800 at ≤32 px
- Corner radius: 22% of canvas at ≥32 px, 16% at smaller sizes
- Glyph size: 78% of canvas at ≥48 px, 82% at smaller sizes
- Baseline: 80% of canvas height
- Subtle inner shadow on the glyph at ≥48 px only (`rgba(0,0,0,0.45)`, blur 5%, offset y 1.2%)
- macOS canvas padding: 19.6% (artwork sits in 80.4% safe area)

Tray icon design: white rounded-square silhouette with the `b` punched out as transparency, on a transparent background. Reads on both light and dark Windows 11 themes. The mark sits inside a 28×28 area within the 32×32 canvas (2 px transparent border).
