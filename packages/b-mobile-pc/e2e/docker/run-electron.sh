#!/usr/bin/env bash
# Runs inside the container (repo mounted at /p, a scratch user-data dir at /tmp/ud): starts a virtual
# display and the shell with a DevTools port the host-side tests connect to.
set -u
# A display number per run: with host networking, X's abstract socket is shared between containers, so
# two runs both using :99 kill each other's window ("X connection error") when one exits.
export DISPLAY=:${E2E_DISPLAY:-99}
# Sub-pixel (LCD) text like Windows ClearType at 100%: without this the container renders grayscale text
# and cannot show the header/menu blur of b-oss#676. Opt out with E2E_LCD=0.
if [ "${E2E_LCD:-1}" = 1 ]; then
  mkdir -p /etc/fonts/conf.d
  cat >/etc/fonts/conf.d/99-e2e-lcd.conf <<'XML'
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <match target="font">
    <edit name="rgba" mode="assign"><const>rgb</const></edit>
    <edit name="antialias" mode="assign"><bool>true</bool></edit>
    <edit name="hinting" mode="assign"><bool>true</bool></edit>
    <edit name="hintstyle" mode="assign"><const>hintslight</const></edit>
    <edit name="lcdfilter" mode="assign"><const>lcddefault</const></edit>
  </match>
</fontconfig>
XML
fi
Xvfb "$DISPLAY" -screen 0 ${E2E_SCREEN:-520x960x24} >/dev/null 2>&1 &
sleep 2
cd /p/packages/b-mobile-pc
# --proxy-server: only when the host needs one (the dev VM's egress goes through squid).
PROXY_ARGS=()
if [ -n "${E2E_PROXY:-}" ]; then PROXY_ARGS=(--proxy-server="$E2E_PROXY"); fi
BMPC_DIST=/p/packages/b-mobile/dist \
BMPC_API_ORIGIN=http://127.0.0.1:${E2E_STUB_PORT:-5192} \
BMPC_AUTH_ORIGIN=http://127.0.0.1:${E2E_AUTH_PORT:-5193} \
BMPC_TEST_PLAINTEXT_STORE=1 \
BMPC_TEST_NOTIFY_PORT=${E2E_NOTIFY_PORT:-5194} \
BMPC_TEST_POLL_INTERVAL_MS=1000 \
  exec timeout "${E2E_TIMEOUT:-300}" /p/node_modules/electron/dist/electron . \
    --no-sandbox --disable-gpu \
    --use-fake-device-for-media-stream "${PROXY_ARGS[@]}" \
    --remote-debugging-port=${E2E_CDP_PORT:-9222} --user-data-dir=/tmp/ud --enable-logging=stderr
