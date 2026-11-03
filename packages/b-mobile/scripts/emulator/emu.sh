#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Copyright (C) 2026 Ian Stevenson
#
# Headless Android emulator lifecycle for b-mobile checks (b-oss#796). See README.md.
#   emu.sh setup   install emulator + system image (retries on proxy 403), create the AVD
#   emu.sh start   boot headless from the quick-boot snapshot (first run cold-boots, then saves one)
#   emu.sh stop    save the snapshot and kill the emulator
#   emu.sh status  adb devices + emulator process
set -euo pipefail

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
AVD="${AVD:-bmobile-api35}"
IMAGE="${IMAGE:-system-images;android-35;google_apis;x86_64}"
SDKM="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
AVDM="$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager"
EMU="$ANDROID_HOME/emulator/emulator"
# Pin every adb call to the emulator: a real phone may also be attached over wireless debugging
# and must never be touched by this rig.
ADB_BIN="$ANDROID_HOME/platform-tools/adb"
SERIAL="${EMU_SERIAL:-emulator-${EMU_PORT:-5554}}"
adb() { "$ADB_BIN" -s "$SERIAL" "$@"; }
# The JVM-based SDK tools ignore HTTP(S)_PROXY; point them at the dev-box squid (CLAUDE.md).
export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:--Dhttps.proxyHost=localhost -Dhttps.proxyPort=3128 -Dhttp.proxyHost=localhost -Dhttp.proxyPort=3128}"

cmd="${1:-}"
case "$cmd" in
  setup)
    # sdkmanager takes minutes just to read the repo list through the proxy: skip it when installed.
    if [ ! -d "$ANDROID_HOME/emulator" ] || [ ! -d "$ANDROID_HOME/${IMAGE//;//}" ]; then
    # squid rate-limits new connections per domain (403 = limiter, not a block): retry with a pause.
    for i in 1 2 3 4 5 6 7 8; do
      if { yes || true; } | "$SDKM" --sdk_root="$ANDROID_HOME" --install emulator "$IMAGE"; then ok=1; break; fi
      echo "sdkmanager failed (attempt $i), retrying in 60s" >&2; sleep 60
    done
    [ "${ok:-}" = 1 ] || { echo "sdkmanager never succeeded" >&2; exit 1; }
    fi
    if ! "$EMU" -list-avds | grep -qx "$AVD"; then
      echo no | "$AVDM" create avd -n "$AVD" -k "$IMAGE" --force
      # 2 GB guest RAM, 2 cores, modest data partition: one emulator ~2.5-3 GB host RSS.
      cfg="$HOME/.android/avd/$AVD.avd/config.ini"
      sed -i '/^hw.ramSize=/d;/^hw.cpu.ncore=/d;/^disk.dataPartition.size=/d;/^hw.keyboard=/d' "$cfg"
      printf 'hw.ramSize=2048\nhw.cpu.ncore=2\ndisk.dataPartition.size=6G\nhw.keyboard=yes\n' >> "$cfg"
    fi
    ;;
  start)
    if "$ADB_BIN" devices | grep -q "^$SERIAL.device$"; then echo "already running"; exit 0; fi
    [ -r /dev/kvm ] && [ -w /dev/kvm ] || { echo "no access to /dev/kvm: the user must be in group kvm (sudo usermod -aG kvm \$USER, then re-login / restart the agent runner)" >&2; exit 1; }
    # -no-window: headless. -gpu swiftshader_indirect: software GL, no host GPU needed.
    # Default quick-boot loads/saves the snapshot "default_boot" automatically.
    nohup "$EMU" -avd "$AVD" -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect \
      -port "${EMU_PORT:-5554}" ${EMU_PROXY:+-http-proxy $EMU_PROXY} -no-metrics -netdelay none -netspeed full -memory 2048 >"${EMU_LOG:-/tmp/emulator-$AVD.log}" 2>&1 &
    adb wait-for-device
    until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do sleep 2; done
    # Quiet the UI: no animations (stable taps/screenshots), keep screen on, skip lock screen.
    for s in window_animation_scale transition_animation_scale animator_duration_scale; do
      adb shell settings put global "$s" 0
    done
    adb shell svc power stayon true
    adb shell input keyevent KEYCODE_WAKEUP
    echo "emulator ready"
    ;;
  stop)
    adb emu avd snapshot save default_boot >/dev/null 2>&1 || true
    adb emu kill >/dev/null 2>&1 || true
    sleep 3; pkill -f "qemu-system.*-avd $AVD" 2>/dev/null || true
    ;;
  status)
    adb devices; pgrep -fa "qemu-system.*$AVD" | cut -c1-120 || true
    ;;
  *) echo "usage: $0 setup|start|stop|status" >&2; exit 2 ;;
esac
