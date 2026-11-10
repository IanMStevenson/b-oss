# b-oss

> Open-source tools for Blipfoto users

b-oss is a family of free, open-source tools for browsing, posting to and backing up [Blipfoto](https://www.blipfoto.com) journals. It is an independent project and is NOT supported or sponsored by Blipfoto. The project is led and managed by Ian Stevenson in his personal capacity. Ian is also the architect, but implementation has been carried out almost entirely using Claude Code.

Guides, privacy notices and release notes are on the [b-oss website](https://b-oss.dev/).

## Applications

| App | What it does | Get it |
| --- | --- | --- |
| **b-mobile** | Browse, post to and get notified about Blipfoto | [Google Play](https://play.google.com/store/apps/details?id=uk.co.salientpoint.bmobile) (Android), [Microsoft Store](https://apps.microsoft.com/detail/9NZHJ2SVPVHN) (Windows) |
| **b-ark** | Windows desktop app that backs up your Blipfoto journals to local disk | [Microsoft Store](https://apps.microsoft.com/detail/9P736ZD76DC5) |
| **b-ark-chrome** | Browser extension (Chrome, Edge, Chromium) that backs up one journal to a local folder | [Chrome Web Store](https://chromewebstore.google.com/detail/b-ark-chrome/apcmndghbieclompadigikblmlafccpe) |
| **b-view** | Viewer for a b-ark backup, packaged with b-ark and b-ark-chrome; also runs from any static host or the local filesystem | Included with b-ark |
| **b-status** | Unofficial Blipfoto status page, checking the site and API every 15 minutes | [b-oss.dev/status](https://b-oss.dev/status) |

The packages behind them, and how they fit together, are described in [CLAUDE.md](CLAUDE.md) and the [contributor guide](docs/CONTRIBUTOR-GUIDE.md).

## Getting started (development)

```bash
git clone https://github.com/YOUR_USERNAME/b-oss.git
cd b-oss
nvm use
npm run setup
```

New to the project? See the [contributor guide](docs/CONTRIBUTOR-GUIDE.md).

## License

GPLv3 — see [LICENSE](LICENSE)
