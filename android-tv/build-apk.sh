#!/bin/bash
# De Fles — bouwt de Android TV-app (defles-bord.apk) zonder Gradle/Android Studio.
# Nodig: Android SDK (build-tools + platform) en een JDK.
set -euo pipefail
cd "$(dirname "$0")"

SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Library/Android/sdk}}"
BT_VERSION="${BT_VERSION:-34.0.0}"
PLATFORM_VERSION="${PLATFORM_VERSION:-android-34}"
BT="$SDK/build-tools/$BT_VERSION"
ANDROID_JAR="$SDK/platforms/$PLATFORM_VERSION/android.jar"

[ -f "$ANDROID_JAR" ] || { echo "android.jar niet gevonden in $SDK/platforms/$PLATFORM_VERSION"; exit 1; }
[ -x "$BT/aapt2" ] || { echo "build-tools $BT_VERSION niet gevonden in $SDK/build-tools"; exit 1; }

rm -rf build
mkdir -p build/gen build/classes

# 1. Iconen en banner genereren (alleen als ze nog niet bestaan)
if [ ! -f res/drawable/banner.png ]; then
  echo "==> Assets genereren"
  javac -d build tools/MakeAssets.java
  java -Djava.awt.headless=true -cp build MakeAssets res
fi

echo "==> Resources compileren"
"$BT/aapt2" compile --dir res -o build/res.zip
"$BT/aapt2" link -o build/app-unsigned.apk -I "$ANDROID_JAR" \
  --manifest AndroidManifest.xml \
  --min-sdk-version 21 --target-sdk-version 34 \
  --java build/gen --auto-add-overlay \
  build/res.zip

echo "==> Java compileren"
javac -source 8 -target 8 -nowarn -classpath "$ANDROID_JAR" -d build/classes \
  $(find src build/gen -name '*.java')

echo "==> Dexen"
"$BT/d8" --lib "$ANDROID_JAR" --release --output build $(find build/classes -name '*.class')
(cd build && zip -q app-unsigned.apk classes.dex)

echo "==> Uitlijnen en ondertekenen"
"$BT/zipalign" -f 4 build/app-unsigned.apk build/app-aligned.apk
KS="$HOME/.android/debug.keystore"
if [ ! -f "$KS" ]; then
  mkdir -p "$(dirname "$KS")"
  keytool -genkeypair -keystore "$KS" -storepass android -keypass android \
    -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=Android Debug,O=Android,C=US"
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android \
  --out defles-bord.apk build/app-aligned.apk

echo
echo "Klaar: $(pwd)/defles-bord.apk"
echo "Installeren op de Chromecast: adb connect <tv-ip> && adb install -r defles-bord.apk"
