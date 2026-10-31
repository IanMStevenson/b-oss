#!/usr/bin/env bash
# Runs inside the container (repo mounted at /p, a scratch user-data dir at /tmp/ud): starts a virtual
# display and the shell with a DevTools port the host-side tests connect to.
set -u
# A display number of its own: the containers use host networking, and X's abstract socket (@/tmp/.X11-unix/X<n>)
# lives in the network namespace, so two containers on :99 share one display and a finishing run kills the
# others' (every shell dies at once with "X connection error"). run.sh passes a number unique to the container.
DISP="${E2E_DISPLAY:-99}"
export DISPLAY=":$DISP"
Xvfb ":$DISP" -screen 0 520x960x24 >/dev/null 2>&1 &
sleep 2
cd /p/packages/b-mobile-pc
# --proxy-server: only when the host needs one (the dev VM's egress goes through squid).
PROXY_ARGS=()
if [ -n "${E2E_PROXY:-}" ]; then PROXY_ARGS=(--proxy-server="$E2E_PROXY"); fi
BMPC_DIST=${E2E_DIST:-/p/packages/b-mobile/dist} \
BMPC_API_ORIGIN=http://127.0.0.1:${E2E_STUB_PORT:-5192} \
BMPC_AUTH_ORIGIN=http://127.0.0.1:${E2E_AUTH_PORT:-5193} \
BMPC_TEST_PLAINTEXT_STORE=1 \
BMPC_TEST_NOTIFY_PORT=${E2E_NOTIFY_PORT:-5194} \
BMPC_TEST_POLL_INTERVAL_MS=1000 \
  exec timeout "${E2E_TIMEOUT:-300}" /p/node_modules/electron/dist/electron . \
    --no-sandbox --disable-gpu \
    --use-fake-device-for-media-stream "${PROXY_ARGS[@]}" \
    --remote-debugging-port=${E2E_CDP_PORT:-9222} --user-data-dir=/tmp/ud --enable-logging=stderr
