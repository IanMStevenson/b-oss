# b-oss

> Blipfoto Open Source Software

b-oss is a family of open-source tools for backing up and viewing [Blipfoto](https://www.blipfoto.com) journals. It is an independent project and is NOT supported or sponsored by blipfoto. The project is led and mangaged by Ian Stevenson in his personal capacity. Ian is also the architect, but immplementation has been carried out almost entirely using Claude Code.

You can find more information on the [b-oss website](https://ianmstevenson.github.io/b-oss/).

## Applications

- **b-ark** — desktop app (Windows, Mac compatible but we need a mac developer to release it) that backs up your Blipfoto journals to local disk
- **b-view** — browser-based viewer for a b-ark backup, can be deployed to any static web host or run from local filesystem (packaged with b-ark)

## Status

Pre-release. [Download the latest Windows installer](https://github.com/ianstevenson/b-oss/releases) from the Releases page. The installer is unsigned, so Windows SmartScreen will warn on first run — click _More info_ → _Run anyway_. A Mac build (universal DMG) is currently in testing as an unsigned pre-release; a signed Mac release will follow once it's proven and we have a contributor with an Apple Developer account.

## Getting started (development)

```bash
git clone https://github.com/YOUR_USERNAME/b-oss.git
cd b-oss
nvm use
npm run setup
```

## License

GPLv3 — see [LICENSE](LICENSE)
