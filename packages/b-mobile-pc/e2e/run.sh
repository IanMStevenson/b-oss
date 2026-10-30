#!/usr/bin/env bash
# Runs the b-mobile-pc end-to-end tests: the real Electron shell in Docker (Xvfb), driven from the host
# by Playwright over the DevTools protocol, against b-mobile's stub API and a fake sign-in server.
# Linux only; needs Docker. See e2e/README.md.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PKG="$(dirname "$HERE")"
ROOT="$(cd "$PKG/../.." && pwd)"
IMAGE=bmpc-e2e
OUT="${BMPC_E2E_OUT:-$PKG/e2e-out}"
WORK="$(mktemp -d)"
mkdir -p "$OUT"
chmod 777 "$WORK"
PIDS=()

cleanup() {
  docker rm -f bmpc-e2e-shell >/dev/null 2>&1 || true
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  rm -rf "$WORK"
}
trap cleanup EXIT

# 1. The image (once).
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "building $IMAGE ..."
  proxy_args=()
  [ -n "${http_proxy:-}" ] && proxy_args+=(--build-arg "http_proxy=$http_proxy")
  [ -n "${https_proxy:-}" ] && proxy_args+=(--build-arg "https_proxy=$https_proxy")
  docker build --network host "${proxy_args[@]}" -t "$IMAGE" "$HERE/docker"
fi

# 2. The Linux Electron binary. Electron's own postinstall download can't use a proxy, so fetch the
#    zip with curl (which honours https_proxy) when it is missing.
ELECTRON_DIR="$ROOT/node_modules/electron"
if [ ! -x "$ELECTRON_DIR/dist/electron" ]; then
  version="$(node -p "require('$ELECTRON_DIR/package.json').version")"
  echo "fetching Electron $version ..."
  curl -fL --retry 3 -o "$WORK/electron.zip" \
    "https://github.com/electron/electron/releases/download/v$version/electron-v$version-linux-x64.zip"
  mkdir -p "$ELECTRON_DIR/dist"
  unzip -q -o "$WORK/electron.zip" -d "$ELECTRON_DIR/dist"
  printf electron > "$ELECTRON_DIR/path.txt"
fi

# 3. The builds the shell serves and runs.
(cd "$ROOT" && npm run build -w @b-oss/b-mobile && npm run build -w @b-oss/b-mobile-pc)

# 4. The stand-in servers on the host (the container uses host networking).
node "$ROOT/packages/b-mobile/scripts/stub-api.mjs" 5192 >"$OUT/stub-api.log" 2>&1 &
PIDS+=($!)
node "$HERE/fake-authorize.mjs" 5193 >"$OUT/fake-authorize.log" 2>&1 &
PIDS+=($!)

# 5. The shell, in the container.
docker run -d --rm --name bmpc-e2e-shell --network host \
  -e E2E_PROXY="${https_proxy:-}" \
  -v "$ROOT:/p" -v "$WORK:/tmp/ud" "$IMAGE" bash /p/packages/b-mobile-pc/e2e/docker/run-electron.sh >/dev/null
for _ in $(seq 1 60); do
  curl -fs http://127.0.0.1:9222/json/version >/dev/null 2>&1 && break
  sleep 1
done
curl -fs http://127.0.0.1:9222/json/version >/dev/null || { docker logs bmpc-e2e-shell | tail -20; exit 1; }

# 6. The tests.
cd "$PKG"
BMPC_E2E_OUT="$OUT" BMPC_E2E_USER_DATA="$WORK" npx vitest run --config e2e/vitest.config.ts "$@"
