#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Builds the tiny test sender APK (sender/) into $1 (default ./sender.apk). Needs the Android SDK
# build-tools + platform and a JDK; no Gradle. Signed with the SDK debug keystore.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$(realpath -m "${1:-$here/sender.apk}")"
SDK="${ANDROID_HOME:-$HOME/Android/Sdk}"
BT="$(ls -d "$SDK"/build-tools/* | sort -V | tail -1)"
JAR="$(ls -d "$SDK"/platforms/android-* | sort -V | tail -1)/android.jar"
w="$(mktemp -d)"; trap 'rm -rf "$w"' EXIT
mkdir "$w/classes"
javac --release 11 -cp "$JAR" -d "$w/classes" "$here"/sender/src/emutest/*.java
"$BT/d8" --release --lib "$JAR" --output "$w" "$w"/classes/emutest/*.class
"$BT/aapt2" link --manifest "$here/sender/AndroidManifest.xml" -I "$JAR" --min-sdk-version 24 --target-sdk-version 35 -o "$w/base.apk"
(cd "$w" && jar uf base.apk classes.dex)
ks="$HOME/.android/debug.keystore"
[ -f "$ks" ] || keytool -genkeypair -keystore "$ks" -storepass android -keypass android -alias androiddebugkey -dname "CN=Android Debug,O=Android,C=US" -keyalg RSA -keysize 2048 -validity 10000 >/dev/null
"$BT/apksigner" sign --ks "$ks" --ks-pass pass:android --key-pass pass:android --out "$out" "$w/base.apk"
echo "$out"
