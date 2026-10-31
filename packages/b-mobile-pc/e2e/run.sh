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

# A unique id and free ports per run, so several runs (workers, the coordinator) can share a machine
# (b-oss#683). Override any of them from the environment to pin one.
ID="${E2E_ID:-$$}"
CONTAINER="bmpc-e2e-shell-$ID"
# Six free ports, found by binding port 0 on all six at once (so they are distinct). The last two are
# the DevTools ports of the variant shells below.
if [ -z "${E2E_CDP_PORT:-}${E2E_STUB_PORT:-}${E2E_AUTH_PORT:-}${E2E_NOTIFY_PORT:-}${E2E_V1_PORT:-}${E2E_V2_PORT:-}" ]; then
  read -r E2E_CDP_PORT E2E_STUB_PORT E2E_AUTH_PORT E2E_NOTIFY_PORT E2E_V1_PORT E2E_V2_PORT < <(node -e "
    const net = require('node:net');
    const servers = [0, 1, 2, 3, 4, 5].map(() => net.createServer());
    Promise.all(servers.map((s) => new Promise((r) => s.listen(0, '127.0.0.1', () => r(s.address().port)))))
      .then((ports) => { console.log(ports.join(' ')); servers.forEach((s) => s.close()); });
  ")
fi
export E2E_CDP_PORT E2E_STUB_PORT E2E_AUTH_PORT E2E_NOTIFY_PORT E2E_V1_PORT E2E_V2_PORT
echo "e2e run $ID: container $CONTAINER, ports cdp=$E2E_CDP_PORT stub=$E2E_STUB_PORT auth=$E2E_AUTH_PORT notify=$E2E_NOTIFY_PORT"

cleanup() {
  # Only this run's container and servers; never another run's.
  docker rm -f "$CONTAINER" "$CONTAINER-mismatch" "$CONTAINER-nodist" >/dev/null 2>&1 || true
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
#    The map needs a tile key to exist at all (no key = "maps unavailable"); a fake one is enough because the
#    tests answer the tile requests themselves (this VM blocks the tile host).
# Warn (never stop) about keys .env.local lacks (b-oss#699); the tile key is supplied below.
VITE_GEOAPIFY_KEY=e2e-tile-key node "$PKG/scripts/env-check.mjs" --warn-only || true
(cd "$ROOT" && VITE_GEOAPIFY_KEY=e2e-tile-key npm run build -w @b-oss/b-mobile && npm run build -w @b-oss/b-mobile-pc)

# 4. The stand-in servers on the host (the container uses host networking).
node "$ROOT/packages/b-mobile/scripts/stub-api.mjs" "$E2E_STUB_PORT" >"$OUT/stub-api.log" 2>&1 &
PIDS+=($!)
node "$HERE/fake-authorize.mjs" "$E2E_AUTH_PORT" >"$OUT/fake-authorize.log" 2>&1 &
PIDS+=($!)

# 5. The shell, in the container. Run as the container's root: Docker is rootless here, so that maps to
#    the calling user and the files it leaves in $WORK can be removed by the trap above. (Another uid
#    would map to a sub-uid the host user cannot delete.)
docker run -d --rm --name "$CONTAINER" --network host \
  -e E2E_CDP_PORT -e E2E_STUB_PORT -e E2E_AUTH_PORT -e E2E_NOTIFY_PORT -e E2E_DISPLAY="$E2E_CDP_PORT" \
  -e E2E_PROXY="${https_proxy:-}" \
  -v "$ROOT:/p" -v "$WORK:/tmp/ud" "$IMAGE" bash /p/packages/b-mobile-pc/e2e/docker/run-electron.sh >/dev/null
for _ in $(seq 1 60); do
  curl -fs http://127.0.0.1:$E2E_CDP_PORT/json/version >/dev/null 2>&1 && break
  sleep 1
done
curl -fs http://127.0.0.1:$E2E_CDP_PORT/json/version >/dev/null || { docker logs "$CONTAINER" | tail -20; exit 1; }

# 5b. Variant shells: the same app started a different way, for the tests that need a shell that is
#     deliberately wrong in one respect. Each has its own container, user-data directory and DevTools
#     port, and shares the stub servers. `start_variant <name> <cdp port> [docker -e ...]`.
start_variant() {
  local name="$1" port="$2"
  shift 2
  mkdir -p "$WORK/$name"
  chmod 777 "$WORK/$name"
  docker run -d --rm --name "$CONTAINER-$name" --network host \
    -e E2E_CDP_PORT="$port" -e E2E_DISPLAY="$port" -e E2E_STUB_PORT -e E2E_AUTH_PORT -e E2E_NOTIFY_PORT=0 \
    -e E2E_PROXY="${https_proxy:-}" "$@" \
    -v "$ROOT:/p" -v "$WORK/$name:/tmp/ud" "$IMAGE" bash /p/packages/b-mobile-pc/e2e/docker/run-electron.sh >/dev/null
  for _ in $(seq 1 60); do
    curl -fs http://127.0.0.1:$port/json/version >/dev/null 2>&1 && return 0
    sleep 1
  done
  docker logs "$CONTAINER-$name" | tail -20
  return 1
}
# A shell that reports an older build than the web files it serves (b-oss#696).
start_variant mismatch "$E2E_V1_PORT" -e BMPC_SHELL_VERSION=e2e-older-shell
# A shell whose web build directory exists but is empty (b-oss#695).
mkdir -p "$WORK/nodist/empty-web"
start_variant nodist "$E2E_V2_PORT" -e E2E_DIST=/tmp/ud/empty-web

# 6. The tests.
cd "$PKG"
BMPC_CDP="http://127.0.0.1:$E2E_CDP_PORT" BMPC_STUB="http://127.0.0.1:$E2E_STUB_PORT" \
BMPC_NOTIFY="http://127.0.0.1:$E2E_NOTIFY_PORT" BMPC_E2E_CONTAINER="$CONTAINER" \
BMPC_CDP_MISMATCH="http://127.0.0.1:$E2E_V1_PORT" BMPC_UD_MISMATCH="$WORK/mismatch" \
BMPC_CDP_NODIST="http://127.0.0.1:$E2E_V2_PORT" BMPC_UD_NODIST="$WORK/nodist" \
BMPC_E2E_OUT="$OUT" BMPC_E2E_USER_DATA="$WORK" npx vitest run --config e2e/vitest.config.ts "$@"
